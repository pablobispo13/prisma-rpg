import type { NextApiResponse } from "next";
import { LogType } from "@prisma/client";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { rollDice } from "../../../lib/dice";
import { getAttributeValue } from "../../../lib/attributes";
import { hideCharacterSanity } from "../../../lib/campaignAccess";
import { notifyCombatUpdate, notifyCombatListUpdate } from "../../../lib/pusher";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const { campaignId, isMaster } = req.campaign!;
    const { action, combatId, participantIds, turnId } = req.body;

    // Para qualquer ação que opere sobre um combatId existente, valida que ele pertence à mesa
    if (combatId) {
        const owning = await prisma.combat.findUnique({
            where: { id: combatId },
            select: { campaignId: true },
        });
        if (!owning || owning.campaignId !== campaignId) {
            res.status(404).json({ message: "Combate não encontrado nesta mesa" });
            return;
        }
    }

    switch (action) {
        case "startCombat": {
            if (!participantIds || participantIds.length === 0) {
                res.status(400).json({ message: "Necessário informar participantes" });
                return;
            }

            // Garante que todos os participantes pertencem à mesa atual
            const charsInCampaign = await prisma.character.findMany({
                where: { id: { in: participantIds }, campaignId },
                select: { id: true, life: true, agility: true },
            });
            if (charsInCampaign.length !== participantIds.length) {
                res.status(400).json({ message: "Algum personagem não pertence a esta mesa" });
                return;
            }

            // Rolagem de iniciativa é determinada antes da transação (lado puramente computacional).
            // Desempate por Agilidade quando iniciativa for igual.
            const rolled = charsInCampaign
                .map((char) => {
                    const roll = rollDice("1d20");
                    return {
                        characterId: char.id,
                        life: char.life,
                        agility: char.agility,
                        initiative: roll.total + char.agility,
                    };
                })
                .sort((a, b) => b.initiative - a.initiative || b.agility - a.agility);

            const { combatId: newCombatId, order } = await prisma.$transaction(async (tx) => {
                const created = await tx.combat.create({ data: { active: true, campaignId } });

                const participants = await Promise.all(
                    rolled.map((r, index) =>
                        tx.combatParticipant.create({
                            data: {
                                combatId: created.id,
                                characterId: r.characterId,
                                currentLife: r.life,
                                turnOrder: index,
                                initiative: r.initiative,
                            },
                        }).then((p) => ({
                            id: p.id,
                            characterId: r.characterId,
                            initiative: r.initiative,
                            agility: r.agility,
                        }))
                    )
                );

                await tx.actionLog.create({
                    data: { type: LogType.COMBAT_START, message: "Combate iniciado", combatId: created.id },
                });

                return { combatId: created.id, order: participants };
            }, { timeout: 15000 });

            const combatFull = await prisma.combat.findUnique({
                where: { id: newCombatId },
                include: {
                    participants: { include: { character: true } },
                    turns: true,
                    logs: true,
                    rollResults: true,
                },
            });
            notifyCombatUpdate(newCombatId);
            notifyCombatListUpdate(campaignId);
            const combatFullSanitized = combatFull && {
                ...combatFull,
                participants: combatFull.participants.map((p) => ({
                    ...p,
                    character: hideCharacterSanity(p.character, isMaster),
                })),
            };
            res.status(201).json({ combat: combatFullSanitized, order });
            return;
        }

        case "startTurn": {
            if (!combatId) return res.status(400).json({ message: "Dados insuficientes" });

            const combat = await prisma.combat.findUnique({
                where: { id: combatId },
                include: { participants: { include: { character: true, combat: true } } },
            });
            if (!combat || combat.participants.length === 0) {
                res.status(404).json({ message: "Combate não encontrado ou sem participantes" });
                return;
            }

            const currentIndex = combat.currentTurnIndex;
            const participant = combat.participants.find((p) => p.turnOrder === currentIndex);
            if (!participant) return res.status(400).json({ message: "Nenhum participante para a vez atual" });

            // Idempotência: retorna turno já existente para evitar duplicatas
            // (Mongo: turno aberto pode ter endedAt null OU ausente no documento)
            const existingTurn = await prisma.combatTurn.findFirst({
                where: {
                    combatId,
                    characterId: participant.characterId,
                    turnNumber: combat.round,
                    OR: [{ endedAt: null }, { endedAt: { isSet: false } }],
                },
                include: { rollResults: true, logs: true },
            });
            if (existingTurn) {
                return res.status(200).json(existingTurn);
            }

            const turn = await prisma.combatTurn.create({
                // endedAt: null explícito para filtros de igualdade funcionarem no Mongo
                data: { combatId, characterId: participant.characterId, turnNumber: combat.round, endedAt: null },
                include: { rollResults: true, logs: true }
            });
            const activeEffects = await prisma.characterEffect.findMany({
                where: { characterId: participant.characterId, remainingTurns: { gt: 0 } },
                include: {
                    preset: { select: { name: true } },
                    presetEffect: { select: { name: true } },
                },
            });

            const combatParticipantForEffect = await prisma.combatParticipant.findFirst({
                where: { combatId, characterId: participant.characterId }
            });

            const char = await prisma.character.findUnique({ where: { id: participant.characterId } });

            // Efeitos removidos por reteste vencido nesta virada (não devem tickar)
            const freedEffectIds = new Set<string>();

            for (const effect of activeEffects) {
                if (!char) continue;

                const effectName = effect.presetEffect?.name ?? effect.preset?.name ?? "efeito";

                // Reteste por rodada (efeitos resistidos, ex: controle mental):
                // o valor a bater decai contestDecay a cada rodada; se o personagem
                // tirar MAIS no teste, se liberta do efeito antes do prazo
                if (effect.retestEachRound && effect.contestValue != null) {
                    const decayedValue = effect.contestValue - (effect.contestDecay ?? 0);
                    const retestRoll = rollDice("1d20");
                    const attrBonus = effect.contestAttribute ? getAttributeValue(char, effect.contestAttribute) : 0;
                    const retestTotal = retestRoll.total + attrBonus;

                    if (retestTotal > decayedValue) {
                        await prisma.actionLog.create({
                            data: {
                                type: LogType.ROLL,
                                message: `${char.name} venceu o teste de resistência (${retestTotal} vs ${decayedValue}) e se libertou de ${effectName}`,
                                characterId: char.id,
                                combatId,
                                turnId: turn.id,
                            },
                        });
                        await prisma.characterEffect.delete({ where: { id: effect.id } });
                        freedEffectIds.add(effect.id);
                        continue;
                    }

                    await prisma.characterEffect.update({
                        where: { id: effect.id },
                        data: { contestValue: decayedValue },
                    });
                    await prisma.actionLog.create({
                        data: {
                            type: LogType.ROLL,
                            message: `${char.name} falhou no teste de resistência (${retestTotal} vs ${decayedValue}) e continua sob ${effectName}`,
                            characterId: char.id,
                            combatId,
                            turnId: turn.id,
                        },
                    });
                }

                if (effect.type === "HEAL_OVER_TIME" && combatParticipantForEffect) {
                    const newLife = Math.min(combatParticipantForEffect.currentLife + effect.value, char.maxLife);
                    await prisma.combatParticipant.update({ where: { id: combatParticipantForEffect.id }, data: { currentLife: newLife } });
                    await prisma.actionLog.create({
                        data: {
                            type: LogType.HEAL_OVER_TIME,
                            message: `${char.name} recuperou ${effect.value} de vida por efeito ativo`,
                            characterId: char.id,
                            combatId,
                            turnId: turn.id
                        },
                    });
                }

                if (effect.type === "DAMAGE_OVER_TIME" && combatParticipantForEffect) {
                    const newLife = Math.max(combatParticipantForEffect.currentLife - effect.value, 0);
                    await prisma.combatParticipant.update({ where: { id: combatParticipantForEffect.id }, data: { currentLife: newLife } });
                    await prisma.actionLog.create({
                        data: {
                            type: LogType.DAMAGE_OVER_TIME,
                            message: `${char.name} sofreu ${effect.value} de dano por efeito ativo`,
                            characterId: char.id,
                            combatId,
                            turnId: turn.id
                        },
                    });
                }

                await prisma.characterEffect.update({
                    where: { id: effect.id },
                    data: { remainingTurns: effect.remainingTurns - 1 }
                });

                if (effect.remainingTurns - 1 <= 0) {
                    await prisma.characterEffect.delete({ where: { id: effect.id } });
                }
            }

            // CONTROLLED: o personagem age sob comando do controlador neste
            // turno (o mestre executa as ações por ele) — não pula o turno
            const controlEffect = activeEffects.find(
                (e) => e.type === "CONTROLLED" && !freedEffectIds.has(e.id)
            );
            if (controlEffect && char) {
                const controller = controlEffect.sourceCharacterId
                    ? await prisma.character.findUnique({
                        where: { id: controlEffect.sourceCharacterId },
                        select: { name: true },
                    })
                    : null;
                await prisma.actionLog.create({
                    data: {
                        type: LogType.TURN_START,
                        message: `${char.name} está sob controle${controller ? ` de ${controller.name}` : ""} — o controlador decide suas ações neste turno`,
                        characterId: char.id,
                        combatId,
                        turnId: turn.id,
                    },
                });
            }

            // STUN: personagem atordoado pula o turno automaticamente
            const isStunned = activeEffects.some(e => e.type === "STUN" && !freedEffectIds.has(e.id));
            if (isStunned && char) {
                await prisma.actionLog.create({
                    data: {
                        type: LogType.TURN_START,
                        message: `${char.name} está atordoado e perdeu o turno`,
                        characterId: participant.characterId,
                        combatId,
                        turnId: turn.id,
                    },
                });
                await prisma.combatTurn.update({ where: { id: turn.id }, data: { endedAt: new Date() } });

                // Avança o índice do turno (mesma lógica do endTurn)
                const sortedParticipants = [...combat.participants].sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
                let nextIndex = currentIndex + 1;
                let nextRound = combat.round;
                for (let i = 0; i < sortedParticipants.length; i++) {
                    if (nextIndex >= sortedParticipants.length) { nextIndex = 0; nextRound++; }
                    if (sortedParticipants[nextIndex].currentLife > 0) break;
                    nextIndex++;
                }
                await prisma.combat.update({ where: { id: combatId }, data: { currentTurnIndex: nextIndex, round: nextRound } });

                // Nova rodada: zera contadores de ataques/reações de todos e
                // limpa vantagem/desvantagem pendente (vale só pela rodada em
                // que foi setada — ver Character.pendingRollModifier)
                if (nextRound > combat.round) {
                    await prisma.combatParticipant.updateMany({
                        where: { combatId },
                        data: { attacksUsed: 0, reactionsUsed: 0 },
                    });
                    await prisma.character.updateMany({
                        where: { id: { in: combat.participants.map((p) => p.characterId) } },
                        data: { pendingRollModifier: null },
                    });
                }

                const turnFull = await prisma.combatTurn.findUnique({ where: { id: turn.id }, include: { rollResults: true, logs: true } });
                notifyCombatUpdate(combatId);
                res.status(201).json({ ...turnFull, skipped: true, reason: "STUN" });
                return;
            }

            await prisma.actionLog.create({
                data: {
                    type: LogType.TURN_START,
                    message: `Turno iniciado para ${participant.character.name}`,
                    characterId: participant.characterId,
                    combatId,
                    turnId: turn.id
                },
            });

            const turnFull = await prisma.combatTurn.findUnique({
                where: { id: turn.id },
                include: {
                    rollResults: true,
                    logs: true,
                }
            });
            notifyCombatUpdate(combatId);
            res.status(201).json(turnFull);
            return;
        }

        case "endTurn": {
            if (!combatId || !turnId) {
                return res.status(400).json({ message: "combatId e turnId são obrigatórios" });
            }
            const turn = await prisma.combatTurn.findUnique({
                where: { id: turnId },
            });

            if (!turn || turn.combatId !== combatId) {
                return res.status(400).json({ message: "Turno inválido para este combate" });
            }

            const combat = await prisma.combat.findUnique({
                where: { id: combatId },
                include: { participants: true }
            });
            if (!combat) return res.status(404).json({ message: "Combate não encontrado" });

            // HP snapshot before advancing the index
            const snapshotData: Record<string, number> = {};
            for (const p of combat.participants) {
                snapshotData[p.characterId] = p.currentLife;
            }
            const newSnapshot = { round: combat.round, turnIndex: combat.currentTurnIndex, data: snapshotData };
            const updatedSnapshots = [...(combat.hpSnapshots as object[]), newSnapshot];

            const sortedParticipants = [...combat.participants].sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
            let nextIndex = combat.currentTurnIndex + 1;
            let nextRound = combat.round;

            // Skip dead participants (currentLife <= 0)
            for (let i = 0; i < sortedParticipants.length; i++) {
                if (nextIndex >= sortedParticipants.length) {
                    nextIndex = 0;
                    nextRound += 1;
                }
                if (sortedParticipants[nextIndex].currentLife > 0) break;
                nextIndex++;
            }

            await prisma.combat.update({
                where: { id: combatId },
                data: { currentTurnIndex: nextIndex, round: nextRound, hpSnapshots: updatedSnapshots }
            });

            // Nova rodada: zera contadores de ataques/reações de todos e
            // limpa vantagem/desvantagem pendente (vale só pela rodada em
            // que foi setada — ver Character.pendingRollModifier)
            if (nextRound > combat.round) {
                await prisma.combatParticipant.updateMany({
                    where: { combatId },
                    data: { attacksUsed: 0, reactionsUsed: 0 },
                });
                await prisma.character.updateMany({
                    where: { id: { in: combat.participants.map((p) => p.characterId) } },
                    data: { pendingRollModifier: null },
                });
            }

            await prisma.actionLog.create({
                data: { type: LogType.TURN_END, message: `Turno finalizado`, combatId, turnId: turn.id }
            });

            await prisma.combatTurn.update({
                where: { id: turn.id },
                data: { endedAt: new Date() },
            });

            notifyCombatUpdate(combatId);
            res.status(200).json({ message: "Turno finalizado", nextTurnIndex: nextIndex, round: nextRound });
            return;
        }

        case "adjustHp": {
            if (!isMaster) {
                return res.status(403).json({ message: "Apenas o mestre pode ajustar HP" });
            }
            const { characterId: hpCharId, newHp } = req.body;
            if (!combatId || !hpCharId || newHp === undefined) {
                return res.status(400).json({ message: "combatId, characterId e newHp são obrigatórios" });
            }
            const hpParticipant = await prisma.combatParticipant.findFirst({
                where: { combatId, characterId: hpCharId },
            });
            if (!hpParticipant) return res.status(404).json({ message: "Participante não encontrado" });
            const hpChar = await prisma.character.findUnique({ where: { id: hpCharId } });
            const clampedHp = Math.max(0, Math.min(Number(newHp), hpChar?.maxLife ?? Number(newHp)));
            await prisma.combatParticipant.update({
                where: { id: hpParticipant.id },
                data: { currentLife: clampedHp },
            });
            await prisma.actionLog.create({
                data: {
                    type: LogType.MANUAL_OVERRIDE,
                    message: `HP de ${hpChar?.name} ajustado para ${clampedHp} pelo mestre`,
                    characterId: hpCharId,
                    combatId,
                    masterOnly: true,
                },
            });
            notifyCombatUpdate(combatId);
            return res.status(200).json({ currentLife: clampedHp });
        }

        // Ajuste manual de sanidade pelo mestre (ex: custo de uma cena de horror
        // não ligado a nenhuma habilidade). Sanidade é do Character, não do
        // CombatParticipant — persiste entre combates, então combatId aqui só
        // serve para contextualizar o log, não para localizar o registro.
        case "adjustSanity": {
            if (!isMaster) {
                return res.status(403).json({ message: "Apenas o mestre pode ajustar sanidade" });
            }
            const { characterId: sanityCharId, newSanity } = req.body;
            if (!sanityCharId || newSanity === undefined) {
                return res.status(400).json({ message: "characterId e newSanity são obrigatórios" });
            }
            const sanityChar = await prisma.character.findUnique({ where: { id: sanityCharId } });
            // Sem combatId (ação fora de combate) o topo do handler não valida
            // pertencimento à mesa — precisa checar aqui pra não vazar entre mesas
            if (!sanityChar || sanityChar.campaignId !== campaignId) {
                return res.status(404).json({ message: "Personagem não encontrado nesta mesa" });
            }

            const n = Number(newSanity);
            if (!Number.isInteger(n) || n < 0) {
                return res.status(400).json({ message: "newSanity deve ser um inteiro >= 0" });
            }
            const clampedSanity = sanityChar.maxSanity != null ? Math.min(n, sanityChar.maxSanity) : n;

            await prisma.character.update({
                where: { id: sanityCharId },
                data: { sanity: clampedSanity },
            });
            await prisma.actionLog.create({
                data: {
                    type: LogType.MANUAL_OVERRIDE,
                    message: `Sanidade de ${sanityChar.name} ajustada para ${clampedSanity} pelo mestre`,
                    characterId: sanityCharId,
                    combatId: combatId ?? null,
                    masterOnly: true,
                },
            });
            if (combatId) notifyCombatUpdate(combatId);
            return res.status(200).json({ sanity: clampedSanity });
        }

        // Vantagem/desvantagem: modificador aplicado a TODA rolagem do
        // personagem (ataque, teste, reação) na rodada corrente — some
        // sozinho quando a rodada avança (ver reset de rodada acima, em
        // startTurn/endTurn). value null/"" limpa antes da hora.
        case "setRollModifier": {
            if (!isMaster) {
                return res.status(403).json({ message: "Apenas o mestre pode definir vantagem/desvantagem" });
            }
            const { characterId: modCharId, value } = req.body;
            if (!modCharId) return res.status(400).json({ message: "characterId obrigatório" });

            const modChar = await prisma.character.findUnique({ where: { id: modCharId } });
            if (!modChar || modChar.campaignId !== campaignId) {
                return res.status(404).json({ message: "Personagem não encontrado nesta mesa" });
            }

            let n: number | null = null;
            if (value !== null && value !== undefined && value !== "") {
                n = Number(value);
                if (!Number.isInteger(n)) {
                    return res.status(400).json({ message: "value deve ser um inteiro (ou vazio para limpar)" });
                }
            }

            await prisma.character.update({ where: { id: modCharId }, data: { pendingRollModifier: n } });

            if (n !== null && n !== 0) {
                await prisma.actionLog.create({
                    data: {
                        type: LogType.MANUAL_OVERRIDE,
                        message: `${modChar.name} vai rolar com ${n > 0 ? "vantagem" : "desvantagem"} (${n > 0 ? "+" : ""}${n}) nesta rodada`,
                        characterId: modCharId,
                        combatId: combatId ?? null,
                    },
                });
            }

            if (combatId) notifyCombatUpdate(combatId);
            return res.status(200).json({ pendingRollModifier: n });
        }

        case "reorderTurns": {
            if (!isMaster) {
                return res.status(403).json({ message: "Apenas o mestre pode reordenar" });
            }
            const { order } = req.body;
            if (!combatId || !order) return res.status(400).json({ message: "Dados inválidos" });

            // Find the participant who is currently active so we can keep pointing at them
            const combatForReorder = await prisma.combat.findUnique({
                where: { id: combatId },
                select: { currentTurnIndex: true, participants: { select: { id: true, turnOrder: true } } },
            });

            await Promise.all(
                (order as { participantId: string; turnOrder: number }[]).map((item) =>
                    prisma.combatParticipant.update({
                        where: { id: item.participantId },
                        data: { turnOrder: item.turnOrder },
                    })
                )
            );

            // Update currentTurnIndex to keep pointing at the same character after reorder
            if (combatForReorder) {
                const activeParticipantId = combatForReorder.participants
                    .find((p) => p.turnOrder === combatForReorder.currentTurnIndex)?.id;

                if (activeParticipantId) {
                    const newTurnOrder = (order as { participantId: string; turnOrder: number }[])
                        .find((item) => item.participantId === activeParticipantId)?.turnOrder;

                    if (newTurnOrder !== undefined) {
                        await prisma.combat.update({
                            where: { id: combatId },
                            data: { currentTurnIndex: newTurnOrder },
                        });
                    }
                }
            }

            notifyCombatUpdate(combatId);
            return res.status(200).json({ message: "Ordem atualizada" });
        }

        case "setStreamUrl": {
            if (!isMaster) {
                return res.status(403).json({ message: "Apenas o mestre pode configurar a stream" });
            }
            const { streamUrl } = req.body;
            if (!combatId) return res.status(400).json({ message: "combatId obrigatório" });
            await prisma.combat.update({ where: { id: combatId }, data: { streamUrl: streamUrl ?? null } });
            return res.status(200).json({ message: "Stream atualizada" });
        }

        case "endCombat": {
            if (!combatId) return res.status(400).json({ message: "Dados insuficientes" });

            // Sync de HP de volta pros characters, limpeza de efeitos e fechamento — tudo atômico
            await prisma.$transaction(async (tx) => {
                const finalParticipants = await tx.combatParticipant.findMany({
                    where: { combatId },
                });

                await Promise.all(
                    finalParticipants.map((p) =>
                        tx.character.update({
                            where: { id: p.characterId },
                            data: { life: p.currentLife },
                        })
                    )
                );

                const participantCharacterIds = finalParticipants.map((p) => p.characterId);
                if (participantCharacterIds.length > 0) {
                    await tx.characterEffect.deleteMany({
                        where: { characterId: { in: participantCharacterIds } },
                    });
                }
                await tx.combatParticipant.updateMany({
                    where: { combatId },
                    data: { tempHp: 0 },
                });

                await tx.combat.update({ where: { id: combatId }, data: { active: false } });
                await tx.actionLog.create({
                    data: { type: LogType.COMBAT_END, message: "Combate finalizado", combatId },
                });
            }, { timeout: 15000 });

            // Estatísticas fora da transação (somente leitura, sem impacto se falhar)
            const rollResults = await prisma.rollResult.findMany({
                where: { combatId },
                include: { character: { select: { id: true, name: true } } }
            });

            const statsByChar: Record<string, { name: string; totalDamage: number; hits: number; misses: number; maxHit: number }> = {};
            for (const r of rollResults) {
                const id = r.characterId;
                if (!statsByChar[id]) {
                    statsByChar[id] = { name: r.character.name, totalDamage: 0, hits: 0, misses: 0, maxHit: 0 };
                }
                if (r.success === true) statsByChar[id].hits++;
                else if (r.success === false) statsByChar[id].misses++;
                if (r.damage) {
                    statsByChar[id].totalDamage += r.damage;
                    statsByChar[id].maxHit = Math.max(statsByChar[id].maxHit, r.damage);
                }
            }

            const combat = await prisma.combat.findUnique({ where: { id: combatId } });
            const stats = {
                rounds: combat?.round ?? 0,
                participants: Object.entries(statsByChar).map(([id, s]) => ({ id, ...s })),
            };

            notifyCombatUpdate(combatId);
            notifyCombatListUpdate(campaignId);
            res.status(200).json({ message: "Combate encerrado", stats });
            return;
        }

        default:
            res.status(400).json({ message: "Ação inválida" });
            return;
    }
}

export default withCampaign(handler);
