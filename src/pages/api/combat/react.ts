import type { NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { rollDice } from "../../../lib/dice";
import { LogType } from "@prisma/client";
import { getAttributeValue } from "../../../lib/attributes";
import { notifyCombatUpdate } from "../../../lib/pusher";

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

    async function applyDamageToTarget(amount: number) {
        if (targetParticipant) {
            const currentTempHp = targetParticipant.tempHp ?? 0;
            let remainingDamage = amount;
            let newTempHp = currentTempHp;

            if (currentTempHp > 0) {
                const absorbed = Math.min(currentTempHp, remainingDamage);
                remainingDamage -= absorbed;
                newTempHp = currentTempHp - absorbed;
                if (absorbed > 0 && attackRoll?.combatId) {
                    await prisma.actionLog.create({
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
            await prisma.combatParticipant.update({
                where: { id: targetParticipant.id },
                data: { currentLife: newLife, tempHp: newTempHp },
            });
        } else {
            await prisma.character.update({
                where: { id: target!.id },
                data: { life: { decrement: amount } },
            });
        }
    }

    async function applyDamageToAttacker(amount: number) {
        if (attackerParticipant) {
            const newLife = Math.max(0, attackerParticipant.currentLife - amount);
            await prisma.combatParticipant.update({
                where: { id: attackerParticipant.id },
                data: { currentLife: newLife },
            });
        } else {
            await prisma.character.update({
                where: { id: attacker!.id },
                data: { life: { decrement: amount } },
            });
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

    let reactionPresetId: string;

    /* =========================
       DEFINE PRESET DA REAÇÃO
    ========================= */
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
    else if (reactionType === "SKIP") {
        await applyDamageToTarget(damage);

        const updatedTargets = (attackRoll.pendingReactionTargets as any).map((rt: any) =>
            rt.targetId === targetId ? { ...rt, status: "SKIPPED" } : rt
        );

        const allReacted = updatedTargets.every((rt: any) => rt.status !== "PENDING");

        await prisma.rollResult.update({
            where: { id: attackRoll.id },
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

            const skippedChars = await prisma.character.findMany({
                where: { id: { in: skippedIds } },
                select: { name: true },
            });

            const nameList = buildNameList(skippedChars.map((c) => c.name));
            await prisma.actionLog.create({
                data: {
                    type: LogType.REACTION,
                    message: `${nameList} ${skippedIds.length > 1 ? "tomaram" : "tomou"} ${damage} de dano`,
                    characterId: target.id,
                    rollId: attackRoll.id,
                    combatId: attackRoll.combatId,
                    turnId,
                },
            });
        }

        if (attackRoll.combatId) notifyCombatUpdate(attackRoll.combatId);
        return res.status(200).json({ success: false, skipped: true });
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
       ROLL DA REAÇÃO
    ========================= */
    const reactionRollData = rollDice(preset.diceFormula);
    const attributeValue = getAttributeValue(target, preset.attribute);
    const reactionModifier = attributeValue + (preset.modifier ?? 0);
    const reactionTotal = reactionRollData.total + reactionModifier;
    let reactionSuccess = false;
    let finalMessage = "";

    /* =========================
       RESOLUÇÃO
    ========================= */

    if (reactionType === "COUNTER_ATTACK") {
        reactionSuccess = reactionRollData.total >= attackRoll.total;

        if (reactionSuccess) {
            if (!preset.impactFormula) {
                return res.status(400).json({ message: "Contra-ataque sem impactFormula configurado" });
            }
            const impactRoll = rollDice(preset.impactFormula);
            const counterDamage = impactRoll.total + (target.strength || 0);
            await applyDamageToAttacker(counterDamage);
            finalMessage = `${target.name} contra-atacou com sucesso (${reactionRollData.total} vs ${attackRoll.total}) e causou ${counterDamage} de dano em ${attacker.name}`;
        } else {
            await applyDamageToTarget(damage);
            finalMessage = `${target.name} falhou no contra-ataque (${reactionTotal} vs ${attackRoll.total}) e sofreu ${damage} de dano`;
        }
    } else {
        reactionSuccess = reactionTotal >= attackRoll.total;
        const actionPt = REACTION_PT[reactionType] ?? reactionType.toLowerCase();

        if (!reactionSuccess) {
            await applyDamageToTarget(damage);
            finalMessage = `${target.name} tentou ${actionPt} (${reactionTotal} vs ${attackRoll.total}) mas falhou e sofreu ${damage} de dano`;
        } else {
            finalMessage = `${target.name} conseguiu ${actionPt} (${reactionTotal} vs ${attackRoll.total}) e evitou o dano`;
        }
    }

    /* =========================
       SALVA ROLL DA REAÇÃO
    ========================= */
    const reactionRoll = await prisma.rollResult.create({
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
        await prisma.combatParticipant.update({
            where: { id: targetParticipant.id },
            data: { reactionsUsed: { increment: 1 } },
        });
    }

    /* =========================
       ATUALIZA STATUS DO ALVO E VERIFICA FIM DA FILA
    ========================= */
    const updatedTargets = (attackRoll.pendingReactionTargets as any).map((rt: any) =>
        rt.targetId === targetId ? { ...rt, status: "REACTED" } : rt
    );

    const allReacted = updatedTargets.every((rt: any) => rt.status !== "PENDING");

    await prisma.rollResult.update({
        where: { id: attackRoll.id },
        data: {
            pendingReactionTargets: updatedTargets,
            reacted: allReacted,
            pendingReaction: !allReacted,
        },
    });

    /* =========================
       LOG
    ========================= */
    await prisma.actionLog.create({
        data: {
            type: LogType.REACTION,
            message: finalMessage,
            characterId: target.id,
            targetId: attacker.id,
            rollId: reactionRoll.id,
            combatId: attackRoll.combatId,
            turnId,
        },
    });

    // If all reactions are resolved and some earlier targets had skipped, log their damage now
    if (allReacted) {
        const skippedIds: string[] = updatedTargets
            .filter((rt: any) => rt.status === "SKIPPED")
            .map((rt: any) => rt.targetId);

        if (skippedIds.length > 0) {
            const skippedChars = await prisma.character.findMany({
                where: { id: { in: skippedIds } },
                select: { name: true },
            });
            const nameList = buildNameList(skippedChars.map((c) => c.name));
            await prisma.actionLog.create({
                data: {
                    type: LogType.REACTION,
                    message: `${nameList} ${skippedIds.length > 1 ? "tomaram" : "tomou"} ${damage} de dano`,
                    characterId: target.id,
                    rollId: attackRoll.id,
                    combatId: attackRoll.combatId,
                    turnId,
                },
            });
        }
    }

    if (attackRoll.combatId) notifyCombatUpdate(attackRoll.combatId); // fire-and-forget
    return res.status(200).json({ success: reactionSuccess });
}

export default authenticate(handler);
