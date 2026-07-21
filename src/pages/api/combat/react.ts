import type { NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { rollDice } from "../../../lib/dice";
import { LogType, Prisma } from "@prisma/client";
import { getAttributeValue } from "../../../lib/attributes";
import { notifyCombatUpdate } from "../../../lib/pusher";

type Tx = Prisma.TransactionClient;

function buildNameList(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
}

const REACTION_PT: Record<string, string> = {
    DODGE: "esquivar",
    BLOCK: "bloquear",
};

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const user = req.user!;
    const { rollId, reactionType, targetId, turnId } = req.body;

    if (!rollId || !reactionType || !targetId)
        return res.status(400).json({ message: "rollId, reactionType, targetId são obrigatórios" });

    if (turnId) {
        const turn = await prisma.combatTurn.findUnique({
            where: { id: turnId },
        });
        if (!turn)
            return res.status(400).json({ message: "turnId inválido" });
    }

    const attackRoll = await prisma.rollResult.findUnique({
        where: { id: rollId },
        include: { preset: true },
    });

    if (!attackRoll || !attackRoll.pendingReactionTargets || attackRoll.pendingReactionTargets.length === 0 || attackRoll.reacted)
        return res.status(400).json({ message: "Reação inválida" });

    const target = await prisma.character.findUnique({
        where: { id: targetId },
    });
    if (!target)
        return res.status(404).json({ message: "Alvo não encontrado" });

    const { canActOnCharacter } = await import("../../../lib/campaignAccess");
    if (!(await canActOnCharacter(user, target.id)))
        return res.status(403).json({ message: "Não é seu personagem" });

    const attacker = await prisma.character.findUnique({
        where: { id: attackRoll.characterId },
    });
    if (!attacker)
        return res.status(404).json({ message: "Atacante não encontrado" });

    // Busca participantes do combate para atualizar currentLife em vez de character.life
    const targetParticipant = attackRoll.combatId
        ? await prisma.combatParticipant.findFirst({
            where: { combatId: attackRoll.combatId, characterId: target.id },
        })
        : null;

    const attackerParticipant = attackRoll.combatId
        ? await prisma.combatParticipant.findFirst({
            where: { combatId: attackRoll.combatId, characterId: attacker.id },
        })
        : null;

    // Busca o dano específico deste alvo — em ataques multi-alvo cada alvo
    // tem seu próprio damageApplied em RollResultDetail
    const targetDetail = await prisma.rollResultDetail.findFirst({
        where: { rollResultId: attackRoll.id, targetId },
    });
    const damage = targetDetail?.damageApplied ?? attackRoll.damage ?? 0;

    async function applyDamageToTarget(tx: Tx, amount: number) {
        if (targetParticipant) {
            const currentTempHp = targetParticipant.tempHp ?? 0;
            let remainingDamage = amount;
            let newTempHp = currentTempHp;

            if (currentTempHp > 0) {
                const absorbed = Math.min(currentTempHp, remainingDamage);
                remainingDamage -= absorbed;
                newTempHp = currentTempHp - absorbed;
                if (absorbed > 0 && attackRoll?.combatId) {
                    await tx.actionLog.create({
                        data: {
                            type: LogType.MANUAL_OVERRIDE,
                            message: `${target!.name} absorveu ${absorbed} de dano com HP temporário`,
                            characterId: target!.id,
                            combatId: attackRoll.combatId,
                            turnId: turnId ?? null,
                        },
                    });
                }
            }

            const newLife = Math.max(0, targetParticipant.currentLife - remainingDamage);
            await tx.combatParticipant.update({
                where: { id: targetParticipant.id },
                data: { currentLife: newLife, tempHp: newTempHp },
            });
        } else {
            await tx.character.update({
                where: { id: target!.id },
                data: { life: { decrement: amount } },
            });
        }
    }

    async function applyDamageToAttacker(tx: Tx, amount: number) {
        if (attackerParticipant) {
            const newLife = Math.max(0, attackerParticipant.currentLife - amount);
            await tx.combatParticipant.update({
                where: { id: attackerParticipant.id },
                data: { currentLife: newLife },
            });
        } else {
            await tx.character.update({
                where: { id: attacker!.id },
                data: { life: { decrement: amount } },
            });
        }
    }

    // Fecha a fila do alvo atual e, se todos reagiram, loga o dano dos que pularam
    async function updateReactionQueue(tx: Tx, status: "SKIPPED" | "REACTED") {
        const updatedTargets = (attackRoll!.pendingReactionTargets as any).map((rt: any) =>
            rt.targetId === targetId ? { ...rt, status } : rt
        );
        const allReacted = updatedTargets.every((rt: any) => rt.status !== "PENDING");

        await tx.rollResult.update({
            where: { id: attackRoll!.id },
            data: {
                pendingReactionTargets: updatedTargets,
                reacted: allReacted,
                pendingReaction: !allReacted,
            },
        });

        if (allReacted) {
            const skippedIds: string[] = updatedTargets
                .filter((rt: any) => rt.status === "SKIPPED")
                .map((rt: any) => rt.targetId);

            if (skippedIds.length > 0) {
                const skippedChars = await tx.character.findMany({
                    where: { id: { in: skippedIds } },
                    select: { name: true },
                });
                const nameList = buildNameList(skippedChars.map((c) => c.name));
                await tx.actionLog.create({
                    data: {
                        type: LogType.REACTION,
                        message: `${nameList} ${skippedIds.length > 1 ? "tomaram" : "tomou"} ${damage} de dano`,
                        characterId: target!.id,
                        rollId: attackRoll!.id,
                        combatId: attackRoll!.combatId,
                        turnId,
                    },
                });
            }
        }
    }

    /* =========================
       LIMITE DE REAÇÕES POR RODADA
       SKIP não consome reação. Limite efetivo: override do
       personagem > config da mesa (null = ilimitado).
    ========================= */
    if (reactionType !== "SKIP" && targetParticipant) {
        const campaign = await prisma.campaign.findUnique({
            where: { id: target.campaignId },
            select: { reactionsPerRound: true },
        });
        const reactionLimit = target.maxReactionsPerRound ?? campaign?.reactionsPerRound ?? null;

        if (reactionLimit !== null && targetParticipant.reactionsUsed >= reactionLimit) {
            return res.status(400).json({
                message: `${target.name} já usou ${reactionLimit} reação(ões) nesta rodada`,
                code: "REACTION_LIMIT_REACHED",
            });
        }
    }

    /* =========================
       SKIP — absorve o dano
    ========================= */
    if (reactionType === "SKIP") {
        await prisma.$transaction(async (tx) => {
            await applyDamageToTarget(tx, damage);
            await updateReactionQueue(tx, "SKIPPED");
        }, { timeout: 15000 });

        if (attackRoll.combatId) notifyCombatUpdate(attackRoll.combatId);
        return res.status(200).json({ success: false, skipped: true });
    }

    /* =========================
       DEFINE PRESET DA REAÇÃO
    ========================= */
    let reactionPresetId: string;

    if (reactionType === "DODGE") {
        if (!target.dodgePresetId)
            return res.status(400).json({ message: "Esquiva não configurada" });
        reactionPresetId = target.dodgePresetId;
    }
    else if (reactionType === "BLOCK") {
        if (!target.blockPresetId)
            return res.status(400).json({ message: "Bloqueio não configurado" });
        reactionPresetId = target.blockPresetId;
    }
    else if (reactionType === "COUNTER_ATTACK") {
        if (!target.counterAttackPresetId)
            return res.status(400).json({ message: "Contra-ataque não configurado" });
        reactionPresetId = target.counterAttackPresetId;
    }
    else {
        return res.status(400).json({ message: "Reação inválida" });
    }

    const preset = await prisma.actionPreset.findUnique({
        where: { id: reactionPresetId },
    });
    if (!preset)
        return res.status(404).json({ message: "Preset inválido" });

    /* =========================
       ROLL E RESOLUÇÃO (cálculo puro, fora da transação)
    ========================= */
    const reactionRollData = rollDice(preset.diceFormula);
    const attributeValue = getAttributeValue(target, preset.attribute);
    const reactionModifier = attributeValue + (preset.modifier ?? 0);
    const reactionTotal = reactionRollData.total + reactionModifier;
    let reactionSuccess = false;
    let finalMessage = "";
    let counterDamage = 0;

    if (reactionType === "COUNTER_ATTACK") {
        reactionSuccess = reactionTotal >= attackRoll.total;

        if (reactionSuccess) {
            if (!preset.impactFormula) {
                return res.status(400).json({ message: "Contra-ataque sem impactFormula configurado" });
            }
            const impactRoll = rollDice(preset.impactFormula);
            counterDamage = impactRoll.total + (target.strength || 0);
            finalMessage = `${target.name} contra-atacou com sucesso (${reactionTotal} vs ${attackRoll.total}) e causou ${counterDamage} de dano em ${attacker.name}`;
        } else {
            finalMessage = `${target.name} falhou no contra-ataque (${reactionTotal} vs ${attackRoll.total}) e sofreu ${damage} de dano`;
        }
    } else {
        reactionSuccess = reactionTotal >= attackRoll.total;
        const actionPt = REACTION_PT[reactionType] ?? reactionType.toLowerCase();

        if (!reactionSuccess) {
            finalMessage = `${target.name} tentou ${actionPt} (${reactionTotal} vs ${attackRoll.total}) mas falhou e sofreu ${damage} de dano`;
        } else {
            finalMessage = `${target.name} conseguiu ${actionPt} (${reactionTotal} vs ${attackRoll.total}) e evitou o dano`;
        }
    }

    /* =========================
       PERSISTÊNCIA ATÔMICA
       Dano, roll da reação, contador da rodada, fila e logs:
       ou grava tudo, ou nada (evita dano aplicado com fila travada)
    ========================= */
    const reactionRoll = await prisma.$transaction(async (tx) => {
        if (reactionType === "COUNTER_ATTACK") {
            if (reactionSuccess) {
                await applyDamageToAttacker(tx, counterDamage);
            } else {
                await applyDamageToTarget(tx, damage);
            }
        } else if (!reactionSuccess) {
            await applyDamageToTarget(tx, damage);
        }

        const created = await tx.rollResult.create({
            data: {
                characterId: target.id,
                presetId: preset.id,
                combatId: attackRoll.combatId,
                turnId,
                targetIds: [attacker.id],
                diceRolled: preset.diceFormula,
                rolls: reactionRollData.rolls,
                modifier: reactionModifier,
                total: reactionTotal,
                success: reactionSuccess,
                critical: false,
            },
        });

        // Consome a reação da rodada (tentativa conta mesmo se falhou)
        if (targetParticipant) {
            await tx.combatParticipant.update({
                where: { id: targetParticipant.id },
                data: { reactionsUsed: { increment: 1 } },
            });
        }

        await updateReactionQueue(tx, "REACTED");

        await tx.actionLog.create({
            data: {
                type: LogType.REACTION,
                message: finalMessage,
                characterId: target.id,
                targetId: attacker.id,
                rollId: created.id,
                combatId: attackRoll.combatId,
                turnId,
            },
        });

        return created;
    }, { timeout: 15000 });

    if (attackRoll.combatId) notifyCombatUpdate(attackRoll.combatId); // fire-and-forget
    return res.status(200).json({ success: reactionSuccess, reactionRollId: reactionRoll.id });
}

export default authenticate(handler);
