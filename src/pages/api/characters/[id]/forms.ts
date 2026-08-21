import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { ActionType, TargetType } from "@prisma/client";

/**
 * POST /api/characters/[id]/forms — cria uma forma alternativa (ex: transformação).
 * Apenas o mestre da mesa. A forma nasce como cópia completa da ficha principal
 * (atributos, presets, reações) e o mestre então a edita normalmente.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query;
  const user = req.user!;

  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const source = await prisma.character.findUnique({
    where: { id },
    include: {
      presets: { include: { effects: { orderBy: { sortOrder: "asc" } } } },
      campaign: { select: { masterId: true } },
      forms: { select: { id: true } },
    },
  });
  if (!source) {
    res.status(404).json({ message: "Personagem não encontrado" });
    return;
  }
  if (source.campaign.masterId !== user.userId && !user.isAdmin) {
    res.status(403).json({ message: "Apenas o mestre da mesa pode criar formas" });
    return;
  }
  if (source.primaryFormId) {
    res.status(400).json({ message: "Não é possível criar forma de outra forma — use o personagem principal" });
    return;
  }

  const formName = typeof req.body?.name === "string" && req.body.name.trim()
    ? req.body.name.trim()
    : `Forma de ${source.name}`;

  // Referência de imagem própria da forma (opcional; sem ela herda a da ficha principal)
  const formImage = typeof req.body?.image === "string" && req.body.image.trim()
    ? req.body.image.trim()
    : source.image;

  const created = await prisma.$transaction(async (tx) => {
    const newForm = await tx.character.create({
      data: {
        name: formName,
        life: source.life,
        maxLife: source.maxLife,
        xp: source.xp,
        strength: source.strength,
        agility: source.agility,
        vigor: source.vigor,
        intellect: source.intellect,
        presence: source.presence,
        baseDefense: source.baseDefense,
        maxReactionsPerRound: source.maxReactionsPerRound,
        maxAttacksPerRound: source.maxAttacksPerRound,
        maxTransformationsPerDay: source.maxTransformationsPerDay,
        history: source.history,
        notes: source.notes,
        image: formImage,
        ownerId: source.ownerId,
        campaignId: source.campaignId,
        primaryFormId: source.id,
      },
    });

    // Presets type=TRANSFORM só existem na ficha principal (nunca copiados
    // pras formas — ver combat/[id].ts, que sempre lê pela primaryForm)
    const copyablePresets = source.presets.filter((p) => p.type !== ActionType.TRANSFORM);

    const presetIdMap: Record<string, string> = {};
    await Promise.all(
      copyablePresets.map(async (p) => {
        const newPreset = await tx.actionPreset.create({
          data: {
            name: p.name,
            description: p.description,
            type: p.type,
            targetType: p.targetType,
            diceFormula: p.diceFormula,
            impactFormula: p.impactFormula,
            modifier: p.modifier,
            critThreshold: p.critThreshold,
            critMultiplier: p.critMultiplier,
            requiresTurn: p.requiresTurn,
            allowOutOfCombat: p.allowOutOfCombat,
            appliesEffect: p.appliesEffect,
            isAreaEffect: p.isAreaEffect,
            transformedOnly: p.transformedOnly,
            attribute: p.attribute,
            durationTurns: p.durationTurns,
            statAffected: p.statAffected,
            effectAmount: p.effectAmount,
            effectType: p.effectType,
            statusApplied: p.statusApplied,
            resolution: p.resolution,
            contestAttribute: p.contestAttribute,
            effectSelectionMode: p.effectSelectionMode,
            usesPerDay: p.usesPerDay,
            characterId: newForm.id,
            ...(p.effects.length > 0
              ? {
                  effects: {
                    create: p.effects.map((e) => ({
                      name: e.name,
                      description: e.description,
                      effectType: e.effectType,
                      target: e.target,
                      value: e.value,
                      valueFormula: e.valueFormula,
                      statAffected: e.statAffected,
                      statusApplied: e.statusApplied,
                      durationTurns: e.durationTurns,
                      retestEachRound: e.retestEachRound,
                      contestDecay: e.contestDecay,
                      sortOrder: e.sortOrder,
                    })),
                  },
                }
              : {}),
          },
        });
        presetIdMap[p.id] = newPreset.id;
      })
    );

    await tx.character.update({
      where: { id: newForm.id },
      data: {
        dodgePresetId: source.dodgePresetId ? (presetIdMap[source.dodgePresetId] ?? null) : null,
        blockPresetId: source.blockPresetId ? (presetIdMap[source.blockPresetId] ?? null) : null,
        counterAttackPresetId: source.counterAttackPresetId ? (presetIdMap[source.counterAttackPresetId] ?? null) : null,
      },
    });

    /* =====================================================
       PRESETS DE TRANSFORMAÇÃO (auto-gerados, ficha principal)
       Ação livre (requiresTurn=false) — o limite fica em
       Character.maxTransformationsPerDay, não no preset.
    ===================================================== */
    await tx.actionPreset.create({
      data: {
        name: `Virar ${formName}`,
        description: `Assume a forma "${formName}".`,
        type: ActionType.TRANSFORM,
        targetType: TargetType.SELF,
        diceFormula: "0",
        attribute: "STRENGTH",
        requiresTurn: false,
        allowOutOfCombat: true,
        appliesEffect: false,
        characterId: source.id,
        targetFormId: newForm.id,
      },
    });

    // Preset de "voltar à base" é compartilhado por todas as formas —
    // só cria na primeira vez (targetFormId: null identifica ele)
    const hasRevertPreset = await tx.actionPreset.findFirst({
      where: { characterId: source.id, type: ActionType.TRANSFORM, targetFormId: null },
      select: { id: true },
    });
    if (!hasRevertPreset) {
      await tx.actionPreset.create({
        data: {
          name: "Voltar à forma base",
          description: `Retorna à ficha original (${source.name}). Não consome o limite diário de transformações.`,
          type: ActionType.TRANSFORM,
          targetType: TargetType.SELF,
          diceFormula: "0",
          attribute: "STRENGTH",
          requiresTurn: false,
          allowOutOfCombat: true,
          appliesEffect: false,
          characterId: source.id,
          targetFormId: null,
        },
      });
    }

    return newForm;
  });

  res.status(201).json({ id: created.id, name: created.name, primaryFormId: source.id });
  return;
}

export default authenticate(handler);
