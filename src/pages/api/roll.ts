import type { NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
import { authenticate, AuthenticatedRequest } from "../../lib/auth";
import { rollDice } from "../../lib/dice";
import { LogType, EffectType, ActionType, ResolutionType, AttributeType, StatusType } from "@prisma/client";
import { getAttributeValue } from "../../lib/attributes";
import { notifyCombatUpdate } from "../../lib/pusher";
import { canActOnCharacter } from "../../lib/campaignAccess";

function joinNames(names: string[]): string {
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
}

// Efeito "achatado" pronto para aplicar: vem das linhas de PresetEffect do
// preset ou, em presets legados sem linhas, dos campos de efeito único
type EffectSpec = {
    presetEffectId: string | null;
    name: string;
    effectType: EffectType;
    target: "SELF" | "TARGETS";
    value: number | null;
    valueFormula: string | null;
    statAffected: AttributeType | null;
    statusApplied: StatusType | null;
    durationTurns: number | null;
    retestEachRound: boolean;
    contestDecay: number | null;
};

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
        turnId,
        selectedEffectIds
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
        where: { id: actionPresetId },
        include: { effects: { orderBy: { sortOrder: "asc" } } },
    });

    if (!preset)
        return res.status(404).json({ message: "Preset inválido" });

    // TRANSFORM não rola dado nem aplica efeito — é resolvido inteiramente
    // por POST /characters/[id]/switch-form (troca de forma, limite diário
    // por personagem). O front nunca chama /roll pra esse tipo de preset.
    if (preset.type === ActionType.TRANSFORM) {
        return res.status(400).json({
            message: "Presets de transformação usam /characters/[id]/switch-form, não /roll",
        });
    }

    /* =====================================================
       AÇÃO PRINCIPAL DO TURNO (1x por turno, fora ataque)
       Ataques têm slot próprio (attacksUsed/maxAttacksPerRound, abaixo).
       Demais ações com requiresTurn=true (habilidades "clássicas") só
       podem ser usadas 1x por turno — enforcement no servidor, não só
       no front (que é facilmente dessincronizado por reload de página).
       requiresTurn=false = ação livre, não entra nesta checagem.
    ===================================================== */
    if (turnId && preset.type !== ActionType.ATTACK && preset.requiresTurn) {
        const existingMainAction = await prisma.rollResult.findFirst({
            where: { turnId, preset: { requiresTurn: true, type: { not: ActionType.ATTACK } } },
            select: { id: true },
        });
        if (existingMainAction) {
            return res.status(400).json({
                message: "A ação principal deste turno já foi usada",
                code: "MAIN_ACTION_ALREADY_USED",
            });
        }
    }

    /* =====================================================
       SELEÇÃO DE EFEITOS (multi-efeito)
       Presets com linhas de PresetEffect usam-nas; o modo de seleção
       define se o jogador escolhe (CHOOSE_ONE/CHOOSE_ANY) ou aplica
       todas (ALL). Presets legados caem nos campos de efeito único.
    ===================================================== */
    let effectSpecs: EffectSpec[] = [];

    if (preset.effects.length > 0) {
        let chosen = preset.effects;
        const mode = preset.effectSelectionMode;

        if (mode === "CHOOSE_ONE" || mode === "CHOOSE_ANY") {
            const ids: string[] = Array.isArray(selectedEffectIds) ? selectedEffectIds.map(String) : [];
            const validIds = new Set(preset.effects.map((e) => e.id));

            if (ids.some((i) => !validIds.has(i))) {
                return res.status(400).json({
                    message: "selectedEffectIds contém efeito que não pertence a este preset",
                    code: "EFFECT_SELECTION_INVALID",
                });
            }
            if (mode === "CHOOSE_ONE" && ids.length !== 1) {
                return res.status(400).json({
                    message: "Esta habilidade exige escolher exatamente 1 efeito",
                    code: "EFFECT_SELECTION_REQUIRED",
                    mode,
                    effects: preset.effects.map((e) => ({ id: e.id, name: e.name, description: e.description })),
                });
            }
            if (mode === "CHOOSE_ANY" && ids.length === 0) {
                return res.status(400).json({
                    message: "Escolha pelo menos 1 efeito desta habilidade",
                    code: "EFFECT_SELECTION_REQUIRED",
                    mode,
                    effects: preset.effects.map((e) => ({ id: e.id, name: e.name, description: e.description })),
                });
            }
            chosen = preset.effects.filter((e) => ids.includes(e.id));
        }

        effectSpecs = chosen.map((e) => ({
            presetEffectId: e.id,
            name: e.name,
            effectType: e.effectType,
            target: e.target,
            value: e.value,
            valueFormula: e.valueFormula,
            statAffected: e.statAffected,
            statusApplied: e.statusApplied,
            durationTurns: e.durationTurns,
            retestEachRound: e.retestEachRound,
            contestDecay: e.contestDecay,
        }));
    } else if (preset.appliesEffect) {
        effectSpecs = [{
            presetEffectId: null,
            name: preset.name,
            effectType: preset.effectType ?? (
                preset.type === ActionType.ATTACK ? EffectType.DAMAGE_OVER_TIME : EffectType.HEAL_OVER_TIME
            ),
            target: "TARGETS",
            value: preset.effectAmount,
            valueFormula: null,
            statAffected: preset.statAffected,
            statusApplied: preset.statusApplied,
            durationTurns: preset.durationTurns,
            retestEachRound: false,
            contestDecay: null,
        }];
    }

    // Atributo do alvo no teste resistido (null = espelha o do conjurador)
    const contestAttribute = preset.contestAttribute ?? preset.attribute;

    /* =====================================================
       LIMITE DE USOS POR DIA (ActionPreset.usesPerDay, null = ilimitado)
       Escopado ao "dia do mundo" (Campaign.worldDay, null = dia 1) — o
       mestre avança o dia em POST /campaigns/[id]/advance-day, o que
       libera o contador de novo (nova linha de PresetDailyUsage).
       Vale para qualquer tipo de ação (ataque, cura, suporte...), em
       combate ou fora, não só ataques.
    ===================================================== */
    let dailyUsage: { worldDay: number } | null = null;
    if (preset.usesPerDay != null) {
        const campaignForDay = await prisma.campaign.findUnique({
            where: { id: character.campaignId },
            select: { worldDay: true },
        });
        const worldDay = campaignForDay?.worldDay ?? 1;

        const existingUsage = await prisma.presetDailyUsage.findUnique({
            where: { characterId_presetId_worldDay: { characterId: character.id, presetId: preset.id, worldDay } },
        });
        if (existingUsage && existingUsage.usedCount >= preset.usesPerDay) {
            return res.status(400).json({
                message: `Limite de ${preset.usesPerDay} uso(s) por dia de "${preset.name}" atingido`,
                code: "DAILY_LIMIT_REACHED",
                usesPerDay: preset.usesPerDay,
                usedToday: existingUsage.usedCount,
                worldDay,
            });
        }
        dailyUsage = { worldDay };
    }

    /* =====================================================
       CUSTO DE SANIDADE POR USO DE HABILIDADE (todas, automático)
       Configurado pelo mestre — Campaign.abilitySanityCost, com override
       por personagem em Character.abilitySanityCostOverride. Cobrado do
       CONJURADOR uma vez por rolagem (independe de acerto/erro ou de
       quantos alvos), somando-se a qualquer PresetEffect SANITY_DRAIN
       específico da habilidade. No-op se sanidade não é rastreada neste
       personagem (character.sanity == null) — mesma regra do efeito manual.
    ===================================================== */
    let abilitySanityCost: number | null = null;
    if (character.sanity != null) {
        const campaignForSanityCost = await prisma.campaign.findUnique({
            where: { id: character.campaignId },
            select: { abilitySanityCost: true },
        });
        abilitySanityCost = character.abilitySanityCostOverride ?? campaignForSanityCost?.abilitySanityCost ?? null;
    }

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

    // Pré-carrega todos os targets pra evitar findUnique dentro da transação.
    // statusEffects ativos entram no cálculo da defesa efetiva (DEFENSE_BUFF/DEBUFF)
    const targetsLoaded = await prisma.character.findMany({
        where: { id: { in: resolvedTargetIds } },
        include: {
            statusEffects: { where: { remainingTurns: { gt: 0 } } },
        },
    });
    const targetsById = new Map(targetsLoaded.map((t) => [t.id, t]));

    const participantsLoaded = combatId
        ? await prisma.combatParticipant.findMany({
            where: { combatId, characterId: { in: resolvedTargetIds } },
        })
        : [];
    const participantByCharId = new Map(participantsLoaded.map((p) => [p.characterId, p]));

    // Participante do conjurador (efeitos com target SELF, ex: TEMP_HP em si)
    const casterParticipant = combatId
        ? participantByCharId.get(character.id) ??
          await prisma.combatParticipant.findFirst({ where: { combatId, characterId: character.id } })
        : null;

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

        // Aplica uma linha de efeito num personagem (alvo ou o próprio conjurador)
        const applyEffectSpec = async (
            spec: EffectSpec,
            recipient: { id: string; name: string; sanity: number | null },
            recipientParticipant: { id: string; tempHp: number | null } | null,
        ) => {
            if (spec.effectType === EffectType.SANITY_DRAIN) {
                // Sanidade não rastreada neste personagem (campo null): sem efeito
                if (recipient.sanity == null) return;
                const amount = spec.valueFormula ? rollDice(spec.valueFormula).total : (spec.value ?? 0);
                if (amount <= 0) return;

                const newSanity = Math.max(0, recipient.sanity - amount);
                await tx.character.update({
                    where: { id: recipient.id },
                    data: { sanity: newSanity },
                });
                // masterOnly: sanidade é informação exclusiva do mestre, o log
                // não deve vazar o desconto (nem o valor) para os jogadores
                await tx.actionLog.create({
                    data: {
                        type: LogType.MANUAL_OVERRIDE,
                        message: `${recipient.name} perdeu ${amount} de sanidade por ${spec.name} (${recipient.sanity} → ${newSanity})`,
                        characterId: character.id,
                        targetId: recipient.id,
                        rollId: created.id,
                        combatId: combatId ?? null,
                        turnId: turnId ?? null,
                        masterOnly: true,
                    },
                });
                return;
            }

            if (spec.effectType === EffectType.TEMP_HP) {
                const amount = spec.valueFormula ? rollDice(spec.valueFormula).total : (spec.value ?? 0);
                if (amount > 0 && recipientParticipant) {
                    const currentTempHp = recipientParticipant.tempHp ?? 0;
                    await tx.combatParticipant.update({
                        where: { id: recipientParticipant.id },
                        data: { tempHp: currentTempHp + amount },
                    });
                    await tx.actionLog.create({
                        data: {
                            type: LogType.MANUAL_OVERRIDE,
                            message: `${recipient.name} ganhou ${amount} de HP temporário por ${spec.name}`,
                            characterId: character.id,
                            targetId: recipient.id,
                            rollId: created.id,
                            combatId: combatId ?? null,
                            turnId: turnId ?? null,
                        },
                    });
                }
                return;
            }

            if (!spec.durationTurns || spec.durationTurns <= 0) return;

            // DAMAGE_TAKEN_BONUS guarda a fórmula (rolada a cada ataque recebido);
            // os demais tipos rolam a fórmula uma única vez, agora
            const keepFormula = spec.effectType === EffectType.DAMAGE_TAKEN_BONUS;
            const value = !keepFormula && spec.valueFormula
                ? rollDice(spec.valueFormula).total
                : (spec.value ?? 0);
            const needsStat = spec.effectType === EffectType.STAT_BUFF || spec.effectType === EffectType.STAT_DEBUFF;
            const isContested = preset.resolution === ResolutionType.CONTESTED && spec.retestEachRound;

            // Recastar a MESMA habilidade (mesmo conjurador) no mesmo alvo
            // RENOVA o efeito em vez de empilhar — evita duplicar (ex: 2
            // efeitos CONTROLLED no mesmo alvo, cada um com contestValue e
            // remainingTurns próprios, confundindo o reteste e a exibição)
            await tx.characterEffect.deleteMany({
                where: {
                    characterId: recipient.id,
                    sourceCharacterId: character.id,
                    ...(spec.presetEffectId
                        ? { presetEffectId: spec.presetEffectId }
                        : { presetId: preset.id, presetEffectId: null }),
                },
            });

            await tx.characterEffect.create({
                data: {
                    characterId: recipient.id,
                    presetId: preset.id,
                    presetEffectId: spec.presetEffectId,
                    sourceCharacterId: character.id,
                    remainingTurns: spec.durationTurns,
                    type: spec.effectType,
                    value,
                    valueFormula: keepFormula ? spec.valueFormula : null,
                    statAffected: needsStat ? spec.statAffected : null,
                    statusApplied: spec.statusApplied ?? null,
                    retestEachRound: isContested,
                    contestValue: isContested ? attackTotal : null,
                    contestDecay: isContested ? (spec.contestDecay ?? 0) : null,
                    contestAttribute: isContested ? contestAttribute : null,
                },
            });

            await tx.actionLog.create({
                data: {
                    type: LogType.MANUAL_OVERRIDE,
                    message: spec.effectType === EffectType.CONTROLLED
                        ? `${recipient.name} está sob controle de ${character.name} por até ${spec.durationTurns} rodada(s)`
                        : `${recipient.name} recebeu efeito ${spec.name} por ${spec.durationTurns} turno(s)`,
                    characterId: character.id,
                    targetId: recipient.id,
                    rollId: created.id,
                    combatId: combatId ?? null,
                    turnId: turnId ?? null,
                },
            });
        };

        for (const targetId of resolvedTargetIds) {
            const target = targetsById.get(targetId);
            if (!target) continue;

            // Defesa efetiva = defesa base + buffs/debuffs de defesa ativos no alvo
            const defenseEffectBonus = (target.statusEffects ?? []).reduce((sum, e) => {
                if (e.type === EffectType.DEFENSE_BUFF) return sum + Math.abs(e.value);
                if (e.type === EffectType.DEFENSE_DEBUFF) return sum - Math.abs(e.value);
                return sum;
            }, 0);
            const effectiveDefense = Math.max(0, (target.baseDefense ?? 0) + defenseEffectBonus);

            // Resolução: DEFENSE (clássica, só p/ ATTACK), CONTESTED (teste
            // resistido: alvo rola 1d20 + atributo contra o total do conjurador,
            // empate favorece o conjurador) ou AUTO (aplica sem teste)
            let passedBaseDefense = true;
            let contestTotal: number | null = null;
            if (preset.resolution === ResolutionType.CONTESTED) {
                const contestRoll = rollDice("1d20");
                contestTotal = contestRoll.total + getAttributeValue(target, contestAttribute);
                passedBaseDefense = attackTotal >= contestTotal;
            } else if (preset.type === ActionType.ATTACK && preset.resolution === ResolutionType.DEFENSE) {
                passedBaseDefense = attackTotal >= effectiveDefense;
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
                        targetDefense: contestTotal ?? effectiveDefense,
                    },
                });
                if (contestTotal !== null) {
                    await tx.actionLog.create({
                        data: {
                            type: LogType.ROLL,
                            message: `${target.name} resistiu a ${preset.name} (${contestTotal} vs ${attackTotal})`,
                            characterId: character.id,
                            targetId,
                            rollId: created.id,
                            combatId: combatId ?? null,
                            turnId: turnId ?? null,
                        },
                    });
                }
                missNames.push(target.name);
                continue;
            }

            if (contestTotal !== null) {
                await tx.actionLog.create({
                    data: {
                        type: LogType.ROLL,
                        message: `${target.name} falhou no teste resistido contra ${preset.name} (${contestTotal} vs ${attackTotal})`,
                        characterId: character.id,
                        targetId,
                        rollId: created.id,
                        combatId: combatId ?? null,
                        turnId: turnId ?? null,
                    },
                });
            }

            // Alvo sem reações restantes na rodada não entra na fila de reação:
            // toma o dano direto (auto-absorve) para não travar os demais alvos
            const targetReactionLimit =
                target.maxReactionsPerRound ?? campaignLimits?.reactionsPerRound ?? null;
            const reactionsExhausted =
                combatParticipant != null &&
                targetReactionLimit != null &&
                (combatParticipant.reactionsUsed ?? 0) >= targetReactionLimit;

            // Reações (esquiva/bloqueio/contra-ataque) só fazem sentido na
            // resolução clássica por defesa — teste resistido já é a "reação"
            const shouldOpenReaction =
                preset.type === ActionType.ATTACK &&
                preset.resolution === ResolutionType.DEFENSE &&
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

            // Alvo "marcado" (DAMAGE_TAKEN_BONUS): recebe dano extra de qualquer
            // ataque enquanto o efeito durar. Fórmula (ex: 1d6) rolada por ataque.
            let targetImpact = impactTotal;
            if (impactTotal && preset.type === ActionType.ATTACK) {
                let markBonus = 0;
                for (const mark of (target.statusEffects ?? []).filter((e) => e.type === EffectType.DAMAGE_TAKEN_BONUS)) {
                    markBonus += mark.valueFormula ? rollDice(mark.valueFormula).total : Math.abs(mark.value);
                }
                if (markBonus > 0) {
                    targetImpact = impactTotal + markBonus;
                    await tx.actionLog.create({
                        data: {
                            type: LogType.DAMAGE,
                            message: `${target.name} está marcado e sofre +${markBonus} de dano`,
                            characterId: character.id,
                            targetId,
                            rollId: created.id,
                            combatId: combatId ?? null,
                            turnId: turnId ?? null,
                        },
                    });
                }
            }

            if (impactTotal) {
                if (combatParticipant) {
                    if (preset.type === ActionType.ATTACK && !shouldOpenReaction) {
                        const currentTempHp = combatParticipant.tempHp ?? 0;
                        let remainingDamage = targetImpact ?? impactTotal;
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
                        afterLife = Math.max(0, target.life - (targetImpact ?? impactTotal));
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
                    damageApplied: preset.type === ActionType.ATTACK ? targetImpact : null,
                    healingApplied: isHealType ? impactTotal : null,
                    targetDefense: contestTotal ?? effectiveDefense,
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

            for (const spec of effectSpecs) {
                if (spec.target !== "TARGETS") continue;
                await applyEffectSpec(spec, { id: target.id, name: target.name, sanity: target.sanity }, combatParticipant);
            }
        }

        // Efeitos com alvo SELF aplicam uma única vez no conjurador — quando a
        // ação surtiu efeito em alguém (ou é AUTO, que não depende de teste)
        const selfSpecs = effectSpecs.filter((s) => s.target === "SELF");
        if (selfSpecs.length > 0 && (hitNames.length > 0 || preset.resolution === ResolutionType.AUTO)) {
            for (const spec of selfSpecs) {
                await applyEffectSpec(spec, { id: character.id, name: character.name, sanity: character.sanity }, casterParticipant);
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

        if (abilitySanityCost && abilitySanityCost > 0) {
            // Relê a sanidade atual dentro da transação (em vez de confiar no
            // snapshot de fora): se esta mesma rolagem já descontou sanidade
            // via PresetEffect SANITY_DRAIN, o custo automático soma em cima
            // do valor já atualizado, não do valor de antes da rolagem.
            const currentChar = await tx.character.findUnique({
                where: { id: character.id },
                select: { sanity: true },
            });
            if (currentChar?.sanity != null) {
                const newSanity = Math.max(0, currentChar.sanity - abilitySanityCost);
                await tx.character.update({
                    where: { id: character.id },
                    data: { sanity: newSanity },
                });
                await tx.actionLog.create({
                    data: {
                        type: LogType.MANUAL_OVERRIDE,
                        message: `${character.name} gastou ${abilitySanityCost} de sanidade ao usar ${preset.name} (${currentChar.sanity} → ${newSanity})`,
                        characterId: character.id,
                        rollId: created.id,
                        combatId: combatId ?? null,
                        turnId: turnId ?? null,
                        masterOnly: true,
                    },
                });
            }
        }

        if (dailyUsage) {
            await tx.presetDailyUsage.upsert({
                where: {
                    characterId_presetId_worldDay: {
                        characterId: character.id,
                        presetId: preset.id,
                        worldDay: dailyUsage.worldDay,
                    },
                },
                update: { usedCount: { increment: 1 } },
                create: {
                    characterId: character.id,
                    presetId: preset.id,
                    worldDay: dailyUsage.worldDay,
                    usedCount: 1,
                },
            });
        }

        return created;
    }, { timeout: 15000 });

    if (combatId) notifyCombatUpdate(combatId); // fire-and-forget, fora da transação
    return res.status(201).json({ roll });
}

export default authenticate(handler);