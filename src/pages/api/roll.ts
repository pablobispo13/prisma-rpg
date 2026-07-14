import type { NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
import { authenticate, AuthenticatedRequest } from "../../lib/auth";
import { rollDice } from "../../lib/dice";
import { LogType, EffectType, ActionType } from "@prisma/client";
import { getAttributeValue } from "../../lib/attributes";
import { notifyCombatUpdate } from "../../lib/pusher";
import { canActOnCharacter } from "../../lib/campaignAccess";

function joinNames(names: string[]): string {
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
}

function buildRollLog(charName: string, presetName: string, presetType: string, hitNames: string[], missNames: string[]): string {
    if (presetType !== ActionType.ATTACK) {
        return `${charName} usou ${presetName} em ${joinNames([...hitNames, ...missNames])}`;
    }
    if (hitNames.length === 0) {
        return `${charName} tentou ${presetName} em ${joinNames(missNames)}, mas falhou na defesa`;
    }
    if (missNames.length === 0) {
        return `${charName} acertou ${presetName} em ${joinNames(hitNames)}`;
    }
    return `${charName} usou ${presetName} — acertou: ${joinNames(hitNames)} | errou: ${joinNames(missNames)}`;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {

    if (req.method === "GET") {
        const { combatId, characterId, limit = 20 } = req.query;

        // Sem characterId nem combatId, exige mesa ativa para escopar
        const headerCampaignId = req.headers["x-campaign-id"];
        const campaignId = typeof headerCampaignId === "string" ? headerCampaignId : null;

        if (!characterId && !combatId && !campaignId) {
            return res.status(400).json({ message: "Informe characterId, combatId ou mesa ativa" });
        }

        if (characterId && !(await canActOnCharacter(req.user!, String(characterId)))) {
            return res.status(403).json({ message: "Sem acesso a este personagem" });
        }

        // Se combatId foi passado, valida acesso à mesa daquele combate
        if (combatId && combatId !== "none") {
            const combat = await prisma.combat.findUnique({
                where: { id: String(combatId) },
                select: { campaignId: true },
            });
            if (!combat) return res.status(404).json({ message: "Combate não encontrado" });
            if (campaignId && combat.campaignId !== campaignId) {
                return res.status(403).json({ message: "Combate não pertence à mesa ativa" });
            }
            // Sem header: ainda valida que o user tem acesso à mesa do combate
            if (!campaignId) {
                const { getCampaignAccess } = await import("../../lib/campaignAccess");
                const access = await getCampaignAccess(req.user!, combat.campaignId);
                if (!access) return res.status(403).json({ message: "Sem acesso a este combate" });
            }
        }

        try {
            const rolls = await prisma.rollResult.findMany({
                where: {
                    ...(combatId === "none"
                        ? { combatId: null }
                        : combatId
                            ? { combatId: String(combatId) }
                            : {}),
                    ...(characterId ? { characterId: String(characterId) } : {}),
                    // Escopo final: garante que mesmo sem characterId/combatId, só venham rolls da mesa ativa
                    ...(!characterId && !combatId && campaignId
                        ? { character: { campaignId } }
                        : {}),
                },
                include: {
                    character: {
                        select: { id: true, name: true },
                    },
                    preset: {
                        select: { id: true, name: true, type: true, impactFormula: true },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
                take: Number(limit),
            });

            return res.status(200).json({ rolls });

        } catch (err) {
            console.error("Erro ao buscar testes", err);
            return res.status(500).json({ message: "Erro interno" });
        }
    }

    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const user = req.user!;

    const {
        characterId,
        actionPresetId,
        diceFormula,
        logMessage,
        targetIds = [],
        combatId,
        turnId
    } = req.body;

    if (!characterId)
        return res.status(400).json({ message: "characterId obrigatório" });

    if (!actionPresetId && !diceFormula)
        return res.status(400).json({
            message: "Informe actionPresetId ou diceFormula"
        });

    if (turnId) {
        const turn = await prisma.combatTurn.findUnique({
            where: { id: turnId }
        });

        if (!turn || (combatId && turn.combatId !== combatId)) {
            return res.status(400).json({
                message: "turnId inválido ou não pertence ao combate"
            });
        }
    }

    const character = await prisma.character.findUnique({
        where: { id: characterId }
    });

    if (!character)
        return res.status(404).json({ message: "Personagem não encontrado" });

    if (!(await canActOnCharacter(user, character.id)))
        return res.status(403).json({ message: "Acesso negado" });


    /* =====================================================
       ROLAGEM MANUAL (SEM PRESET)
    ===================================================== */

    if (diceFormula && !actionPresetId) {

        const dice = rollDice(diceFormula);

        const resolvedTargetIds =
            targetIds.length ? targetIds : [character.id];

        const roll = await prisma.$transaction(async (tx) => {
            const created = await tx.rollResult.create({
                data: {
                    characterId: character.id,
                    presetId: null,
                    combatId: combatId ?? null,
                    turnId: turnId ?? null,
                    targetIds: resolvedTargetIds,
                    diceRolled: diceFormula,
                    rolls: dice.rolls,
                    modifier: 0,
                    total: dice.total,
                    critical: false,
                    success: null,
                    pendingReaction: false,
                    reacted: false,
                    reactionType: null,
                },
            });

            await tx.actionLog.create({
                data: {
                    type: LogType.ROLL,
                    message:
                        logMessage ??
                        `${character.name} rolou ${diceFormula} (${dice.rolls.join(", ")}) = ${dice.total}`,
                    characterId: character.id,
                    rollId: created.id,
                    combatId: combatId ?? null,
                    turnId: turnId ?? null,
                },
            });

            return created;
        });

        return res.status(201).json({ roll });
    }


    /* =====================================================
       ROLAGEM COM PRESET (SISTEMA ORIGINAL)
    ===================================================== */

    const preset = await prisma.actionPreset.findUnique({
        where: { id: actionPresetId }
    });

    if (!preset)
        return res.status(404).json({ message: "Preset inválido" });

    /* =====================================================
       LIMITE DE ATAQUES POR RODADA (só em combate)
       Base: 1 ataque; personagens com habilidade de ataque extra
       têm Character.maxAttacksPerRound configurado pelo mestre.
    ===================================================== */
    let attackerParticipant: { id: string; attacksUsed: number } | null = null;
    let campaignLimits: { reactionsPerRound: number | null } | null = null;

    if (preset.type === ActionType.ATTACK && combatId) {
        campaignLimits = await prisma.campaign.findUnique({
            where: { id: character.campaignId },
            select: { reactionsPerRound: true },
        });

        attackerParticipant = await prisma.combatParticipant.findFirst({
            where: { combatId, characterId: character.id },
            select: { id: true, attacksUsed: true },
        });

        if (attackerParticipant) {
            const attackLimit = character.maxAttacksPerRound ?? 1;

            if (attackerParticipant.attacksUsed >= attackLimit) {
                return res.status(400).json({
                    message: `Limite de ${attackLimit} ataque(s) por rodada atingido`,
                    code: "ATTACK_LIMIT_REACHED",
                });
            }
        }
    }

    const baseAttribute = getAttributeValue(character, preset.attribute);

    // Load all active caster effects
    const allCasterEffects = await prisma.characterEffect.findMany({
        where: { characterId: character.id, remainingTurns: { gt: 0 } },
    });

    // Stat effects: bonus/penalty to the specific attribute used in this action
    const statEffects = allCasterEffects.filter(e => e.statAffected === preset.attribute);
    const effectBonus = statEffects.reduce((sum, e) =>
        sum + (e.type === "STAT_DEBUFF" ? -Math.abs(e.value) : e.value), 0
    );
    const effectiveAttribute = baseAttribute + effectBonus;

    // Roll effects: flat bonus/penalty applied directly to the d20 result
    const rollModifier = allCasterEffects
        .filter(e => e.type === "ROLL_BONUS" || e.type === "ROLL_PENALTY")
        .reduce((sum, e) => sum + (e.type === "ROLL_PENALTY" ? -Math.abs(e.value) : e.value), 0);

    const attackRoll = rollDice(preset.diceFormula);

    const flatModifier = preset.modifier ?? 0;
    const attackTotal = attackRoll.total + effectiveAttribute + flatModifier + rollModifier;

    const isCritical = attackRoll.rolls.some(
        r => r >= (preset.critThreshold ?? 999)
    );

    const resolvedTargetIds =
        preset.targetType === "SELF" || targetIds.length === 0
            ? [character.id]
            : targetIds;


    /* =====================================================
       RESOLUÇÃO POR ALVO — TODA EM UMA TRANSAÇÃO
       Garante que: se algo falhar no meio, nenhum log/HP/efeito é persistido.
       Cálculos puros (dados rolados, totais) acontecem antes para acelerar a tx.
    ===================================================== */

    // Dano é rolado UMA vez e aplicado a todos os alvos
    let impactTotal: number | null = null;
    let impactRolls: number[] = [];

    if (preset.impactFormula) {
        const impactRoll = rollDice(preset.impactFormula);
        impactRolls = impactRoll.rolls;
        impactTotal = impactRoll.total + effectiveAttribute;
        if (isCritical && preset.critMultiplier) {
            impactTotal = Math.floor(impactTotal * preset.critMultiplier);
        }
    }

    // Pré-carrega todos os targets pra evitar findUnique dentro da transação
    const targetsLoaded = await prisma.character.findMany({
        where: { id: { in: resolvedTargetIds } },
    });
    const targetsById = new Map(targetsLoaded.map((t) => [t.id, t]));

    const participantsLoaded = combatId
        ? await prisma.combatParticipant.findMany({
            where: { combatId, characterId: { in: resolvedTargetIds } },
        })
        : [];
    const participantByCharId = new Map(participantsLoaded.map((p) => [p.characterId, p]));

    const roll = await prisma.$transaction(async (tx) => {
        const created = await tx.rollResult.create({
            data: {
                characterId: character.id,
                presetId: preset.id,
                combatId: combatId ?? null,
                turnId: turnId ?? null,
                targetIds: resolvedTargetIds,
                diceRolled: preset.diceFormula,
                rolls: attackRoll.rolls,
                modifier: effectiveAttribute + flatModifier,
                total: attackTotal,
                critical: isCritical,
                success: null,
                pendingReaction: false,
                reacted: false,
                reactionType: null,
            },
        });

        const pendingReactionTargets: Array<{ targetId: string; status: "PENDING" }> = [];
        const hitNames: string[] = [];
        const missNames: string[] = [];
        const directDamageNames: string[] = [];
        const directHealNames: string[] = [];

        for (const targetId of resolvedTargetIds) {
            const target = targetsById.get(targetId);
            if (!target) continue;

            let passedBaseDefense = true;
            if (preset.type === ActionType.ATTACK) {
                passedBaseDefense = attackTotal >= (target.baseDefense ?? 0);
            }

            const combatParticipant = participantByCharId.get(targetId) ?? null;
            const beforeLife = combatParticipant ? combatParticipant.currentLife : target.life;

            if (!passedBaseDefense) {
                await tx.rollResultDetail.create({
                    data: {
                        rollResultId: created.id,
                        targetId,
                        beforeLife,
                        succeeded: false,
                        critical: false,
                        targetDefense: target.baseDefense ?? 0,
                    },
                });
                missNames.push(target.name);
                continue;
            }

            // Alvo sem reações restantes na rodada não entra na fila de reação:
            // toma o dano direto (auto-absorve) para não travar os demais alvos
            const targetReactionLimit =
                target.maxReactionsPerRound ?? campaignLimits?.reactionsPerRound ?? null;
            const reactionsExhausted =
                combatParticipant != null &&
                targetReactionLimit != null &&
                (combatParticipant.reactionsUsed ?? 0) >= targetReactionLimit;

            const shouldOpenReaction =
                preset.type === ActionType.ATTACK &&
                !reactionsExhausted &&
                !!(target.dodgePresetId || target.blockPresetId || target.counterAttackPresetId);

            if (reactionsExhausted && preset.type === ActionType.ATTACK) {
                await tx.actionLog.create({
                    data: {
                        type: LogType.REACTION,
                        message: `${target.name} não tinha reações restantes nesta rodada e absorveu o ataque`,
                        characterId: character.id,
                        targetId,
                        rollId: created.id,
                        combatId: combatId ?? null,
                        turnId: turnId ?? null,
                    },
                });
            }

            const isHealType = preset.type === ActionType.HEAL || preset.type === ActionType.SUPPORT;
            let afterLife = beforeLife;

            if (impactTotal) {
                if (combatParticipant) {
                    if (preset.type === ActionType.ATTACK && !shouldOpenReaction) {
                        const currentTempHp = combatParticipant.tempHp ?? 0;
                        let remainingDamage = impactTotal;
                        let newTempHp = currentTempHp;

                        if (currentTempHp > 0) {
                            const absorbed = Math.min(currentTempHp, remainingDamage);
                            remainingDamage -= absorbed;
                            newTempHp = currentTempHp - absorbed;
                            await tx.actionLog.create({
                                data: {
                                    type: LogType.MANUAL_OVERRIDE,
                                    message: `${target.name} absorveu ${absorbed} de dano com HP temporário`,
                                    characterId: character.id,
                                    targetId,
                                    rollId: created.id,
                                    combatId: combatId ?? null,
                                    turnId: turnId ?? null,
                                },
                            });
                        }

                        afterLife = Math.max(0, beforeLife - remainingDamage);
                        await tx.combatParticipant.update({
                            where: { id: combatParticipant.id },
                            data: { currentLife: afterLife, tempHp: newTempHp },
                        });
                    } else if (isHealType) {
                        afterLife = Math.min(target.maxLife, beforeLife + impactTotal);
                        await tx.combatParticipant.update({
                            where: { id: combatParticipant.id },
                            data: { currentLife: afterLife },
                        });
                    }
                } else {
                    if (preset.type === ActionType.ATTACK) {
                        afterLife = Math.max(0, target.life - impactTotal);
                        await tx.character.update({
                            where: { id: targetId },
                            data: { life: afterLife },
                        });
                    } else if (isHealType) {
                        afterLife = Math.min(target.maxLife, target.life + impactTotal);
                        await tx.character.update({
                            where: { id: targetId },
                            data: { life: afterLife },
                        });
                    }
                }
            }

            await tx.rollResultDetail.create({
                data: {
                    rollResultId: created.id,
                    targetId,
                    beforeLife,
                    succeeded: true,
                    critical: isCritical,
                    damageApplied: preset.type === ActionType.ATTACK ? impactTotal : null,
                    healingApplied: isHealType ? impactTotal : null,
                    targetDefense: target.baseDefense ?? 0,
                },
            });

            if (shouldOpenReaction) {
                pendingReactionTargets.push({ targetId, status: "PENDING" });
            }

            await tx.rollResult.update({
                where: { id: created.id },
                data: {
                    success: true,
                    pendingReaction: shouldOpenReaction,
                    impactRolls: impactRolls.length > 0 ? impactRolls : undefined,
                    damage: preset.type === ActionType.ATTACK ? impactTotal : null,
                    healing: isHealType ? impactTotal : null,
                },
            });

            hitNames.push(target.name);
            if (impactTotal && impactTotal > 0 && !shouldOpenReaction) {
                if (preset.type === ActionType.ATTACK) directDamageNames.push(target.name);
                else if (isHealType) directHealNames.push(target.name);
            }

            if (preset.appliesEffect) {
                const effectType: EffectType = preset.effectType ?? (
                    preset.type === ActionType.ATTACK ? EffectType.DAMAGE_OVER_TIME : EffectType.HEAL_OVER_TIME
                );

                if (effectType === EffectType.TEMP_HP) {
                    const amount = preset.effectAmount ?? 0;
                    if (amount > 0 && combatParticipant) {
                        const currentTempHp = combatParticipant.tempHp ?? 0;
                        await tx.combatParticipant.update({
                            where: { id: combatParticipant.id },
                            data: { tempHp: currentTempHp + amount },
                        });
                        await tx.actionLog.create({
                            data: {
                                type: LogType.MANUAL_OVERRIDE,
                                message: `${target.name} ganhou ${amount} de HP temporário por ${preset.name}`,
                                characterId: character.id,
                                targetId,
                                rollId: created.id,
                                combatId: combatId ?? null,
                                turnId: turnId ?? null,
                            },
                        });
                    }
                } else if (preset.durationTurns && preset.durationTurns > 0) {
                    const effectNeedsStat = effectType === "STAT_BUFF" || effectType === "STAT_DEBUFF";
                    const effectNeedsValue = ["STAT_BUFF", "STAT_DEBUFF", "ROLL_BONUS", "ROLL_PENALTY",
                        "HEAL_OVER_TIME", "DAMAGE_OVER_TIME"].includes(effectType);
                    await tx.characterEffect.create({
                        data: {
                            characterId: target.id,
                            presetId: preset.id,
                            remainingTurns: preset.durationTurns,
                            type: effectType,
                            statAffected: effectNeedsStat ? (preset.statAffected ?? null) : null,
                            value: effectNeedsValue ? (preset.effectAmount ?? 0) : 0,
                        },
                    });
                    await tx.actionLog.create({
                        data: {
                            type: LogType.MANUAL_OVERRIDE,
                            message: `${target.name} recebeu efeito ${preset.name} por ${preset.durationTurns} turnos`,
                            characterId: character.id,
                            targetId,
                            rollId: created.id,
                            combatId: combatId ?? null,
                            turnId: turnId ?? null,
                        },
                    });
                }
            }
        }

        if (hitNames.length === 0 && missNames.length > 0) {
            await tx.rollResult.update({ where: { id: created.id }, data: { success: false } });
        }

        await tx.actionLog.create({
            data: {
                type: LogType.ROLL,
                message: buildRollLog(character.name, preset.name, preset.type as string, hitNames, missNames),
                characterId: character.id,
                rollId: created.id,
                combatId: combatId ?? null,
                turnId: turnId ?? null,
            },
        });

        if (directDamageNames.length > 0 && impactTotal && impactTotal > 0) {
            await tx.actionLog.create({
                data: {
                    type: LogType.DAMAGE,
                    message: directDamageNames.length === 1
                        ? `${directDamageNames[0]} recebeu ${impactTotal} de dano`
                        : `${joinNames(directDamageNames)} receberam ${impactTotal} de dano`,
                    characterId: character.id,
                    rollId: created.id,
                    combatId: combatId ?? null,
                    turnId: turnId ?? null,
                },
            });
        }

        if (directHealNames.length > 0 && impactTotal && impactTotal > 0) {
            await tx.actionLog.create({
                data: {
                    type: LogType.HEAL,
                    message: directHealNames.length === 1
                        ? `${directHealNames[0]} foi curado em ${impactTotal} por ${preset.name}`
                        : `${joinNames(directHealNames)} foram curados em ${impactTotal} por ${preset.name}`,
                    characterId: character.id,
                    rollId: created.id,
                    combatId: combatId ?? null,
                    turnId: turnId ?? null,
                },
            });
        }

        if (pendingReactionTargets.length > 0) {
            await tx.rollResult.update({
                where: { id: created.id },
                data: {
                    pendingReactionTargets: pendingReactionTargets as any,
                },
            });
        }

        if (attackerParticipant) {
            await tx.combatParticipant.update({
                where: { id: attackerParticipant.id },
                data: { attacksUsed: { increment: 1 } },
            });
        }

        return created;
    }, { timeout: 15000 });

    if (combatId) notifyCombatUpdate(combatId); // fire-and-forget, fora da transação
    return res.status(201).json({ roll });
}

export default authenticate(handler);