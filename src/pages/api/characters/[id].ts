import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { hideCharacterSanity } from "../../../lib/campaignAccess";
import { sanitizeCustomAttributeValues } from "../../../lib/customAttributes";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query;
  const user = req.user!;

  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      owner: true,
      campaign: { select: { masterId: true } },
      dodgePreset: true,
      blockPreset: true,
      counterAttackPreset: true,
      targetLogs: true,
      combatParticipants: true,
      turns: true,
      statusEffects: true,
    },
  });

  if (!character) {
    res.status(404).json({ message: "Personagem não encontrado" });
    return;
  }

  const { canActOnCharacter } = await import("../../../lib/campaignAccess");
  if (!(await canActOnCharacter(user, character.id))) {
    res.status(403).json({ message: "Acesso negado" });
    return;
  }

  // Sanidade é exclusiva do mestre — jogadores (mesmo donos da ficha) não veem
  const requesterIsMaster = user.isAdmin || character.campaign.masterId === user.userId;

  // DETALHE
  if (req.method === "GET") {
    // Metadados do grupo de formas (mesmo shape da listagem), tanto para a
    // ficha principal quanto para uma forma
    const primaryId = character.primaryFormId ?? character.id;
    const primaryRow = await prisma.character.findUnique({
      where: { id: primaryId },
      select: {
        id: true,
        name: true,
        image: true,
        activeFormId: true,
        forms: { select: { id: true, name: true, image: true } },
      },
    });
    const formGroup =
      primaryRow && primaryRow.forms.length > 0
        ? {
            primaryId: primaryRow.id,
            activeId: primaryRow.activeFormId ?? primaryRow.id,
            options: [
              { id: primaryRow.id, name: primaryRow.name, image: primaryRow.image },
              ...primaryRow.forms,
            ],
          }
        : null;

    res.status(200).json(hideCharacterSanity({ ...character, formGroup }, requesterIsMaster));
    return;
  }

  // ATUALIZAÇÃO
  if (req.method === "PUT") {
    const {
      name,
      life,
      maxLife,
      xp,
      strength,
      agility,
      vigor,
      intellect,
      presence,
      baseDefense,
      history,
      notes,
      image,
      dodgePresetId,
      blockPresetId,
      counterAttackPresetId,
      maxReactionsPerRound,
      maxAttacksPerRound,
      maxTransformationsPerDay,
      sanity,
      maxSanity,
      abilitySanityCostOverride,
      customAttributes,
    } = req.body;

    // Atributos customizados: merge parcial (só as keys enviadas mudam;
    // as demais mantêm o valor atual). Só aceita keys que existem na mesa.
    let customAttributesValue: Record<string, number> | undefined;
    if (customAttributes && typeof customAttributes === "object") {
      const validDefs = await prisma.customAttribute.findMany({
        where: { campaignId: character.campaignId },
        select: { key: true },
      });
      const existing = (character.customAttributes as Record<string, number> | null) ?? {};
      customAttributesValue = {
        ...existing,
        ...sanitizeCustomAttributeValues(customAttributes, new Set(validDefs.map((a) => a.key))),
      };
    }

    // image pode ser alterada pelo admin ou pelo mestre da mesa deste personagem
    const allowImage = requesterIsMaster;
    if (!allowImage && image !== undefined && image !== character.image) {
      // sem permissão e enviou image diferente: ignora silenciosamente
    }

    // Overrides de limites por rodada e sanidade: apenas mestre da mesa ou
    // admin, senão o jogador poderia se dar ataques/reações extras ou
    // adulterar a própria sanidade
    const allowLimitOverrides = requesterIsMaster;
    const normalizeLimit = (value: unknown): number | null | undefined => {
      if (value === undefined) return undefined; // não altera
      if (value === null || value === "") return null; // volta a usar o da mesa
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 20) return undefined;
      return n;
    };
    // Sanidade não tem teto de 20 como os limites de rodada (é um recurso
    // tipo vida, não um contador por turno)
    const normalizeSanity = (value: unknown): number | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null || value === "") return null; // não rastreada
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return undefined;
      return n;
    };

    const updated = await prisma.character.update({
      where: { id },
      data: {
        name,
        life,
        maxLife,
        xp,
        strength,
        agility,
        vigor,
        intellect,
        presence,
        ...(customAttributesValue !== undefined ? { customAttributes: customAttributesValue } : {}),
        baseDefense,
        history,
        notes,
        ...(allowImage && image !== undefined ? { image: image || null } : {}),
        ...(allowLimitOverrides
          ? {
              maxReactionsPerRound: normalizeLimit(maxReactionsPerRound),
              maxAttacksPerRound: normalizeLimit(maxAttacksPerRound),
              maxTransformationsPerDay: normalizeLimit(maxTransformationsPerDay),
              sanity: normalizeSanity(sanity),
              maxSanity: normalizeSanity(maxSanity),
              abilitySanityCostOverride: normalizeSanity(abilitySanityCostOverride),
            }
          : {}),
        dodgePresetId,
        blockPresetId,
        counterAttackPresetId,
      },
      include: {
        owner: true,
        dodgePreset: true,
        blockPreset: true,
        counterAttackPreset: true,
        targetLogs: true,
        combatParticipants: true,
        turns: true,
        rollResults: { include: { preset: true, logs: true } },
        statusEffects: true,
      },
    });

    res.status(200).json(hideCharacterSanity(updated, requesterIsMaster));
    return;
  }

  // CLONAR PERSONAGEM (apenas o mestre desta mesa)
  if (req.method === "POST") {
    if (character.campaign.masterId !== user.userId) {
      res.status(403).json({ message: "Apenas o mestre da mesa pode clonar personagens" });
      return;
    }

    const source = await prisma.character.findUnique({
      where: { id },
      include: { presets: true },
    });
    if (!source) {
      res.status(404).json({ message: "Personagem não encontrado" });
      return;
    }

    // Clone atômico: character + presets + relink em uma transação
    const cloned = await prisma.$transaction(async (tx) => {
      const newChar = await tx.character.create({
        data: {
          name: `Cópia de ${source.name}`,
          life: source.life,
          maxLife: source.maxLife,
          xp: source.xp,
          strength: source.strength,
          agility: source.agility,
          vigor: source.vigor,
          intellect: source.intellect,
          presence: source.presence,
          customAttributes: source.customAttributes ?? undefined,
          baseDefense: source.baseDefense,
          maxReactionsPerRound: source.maxReactionsPerRound,
          maxAttacksPerRound: source.maxAttacksPerRound,
          maxTransformationsPerDay: source.maxTransformationsPerDay,
          history: source.history,
          notes: source.notes,
          image: source.image,
          ownerId: source.ownerId,
          campaignId: source.campaignId,
        },
      });

      // TRANSFORM aponta pra uma forma do personagem ORIGINAL (targetFormId) —
      // copiar verbatim geraria um preset "morto" no clone (forma não pertence
      // a ele, ver switch-form.ts). Clone não herda formas, então não copia.
      const presetIdMap: Record<string, string> = {};
      await Promise.all(
        source.presets.filter((p) => p.type !== "TRANSFORM").map(async (p) => {
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
              attribute: p.attribute,
              durationTurns: p.durationTurns,
              statAffected: p.statAffected,
              effectAmount: p.effectAmount,
              statusApplied: p.statusApplied,
              characterId: newChar.id,
            },
          });
          presetIdMap[p.id] = newPreset.id;
        })
      );

      await tx.character.update({
        where: { id: newChar.id },
        data: {
          dodgePresetId: source.dodgePresetId ? (presetIdMap[source.dodgePresetId] ?? null) : null,
          blockPresetId: source.blockPresetId ? (presetIdMap[source.blockPresetId] ?? null) : null,
          counterAttackPresetId: source.counterAttackPresetId ? (presetIdMap[source.counterAttackPresetId] ?? null) : null,
        },
      });

      return newChar;
    });

    res.status(201).json({ id: cloned.id, name: cloned.name });
    return;
  }

  // REMOÇÃO
  if (req.method === "DELETE") {
    // Formas alternativas caem junto com o personagem principal
    const formRows = await prisma.character.findMany({
      where: { primaryFormId: id },
      select: { id: true },
    });
    const idsToDelete = [...formRows.map((f) => f.id), id];

    // Validar se tem combates ativos (o personagem ou qualquer forma dele)
    const activeCombats = await prisma.combatParticipant.findMany({
      where: { characterId: { in: idsToDelete } },
      include: { combat: true },
    });

    const hasActiveCombat = activeCombats.some((cp) => cp.combat.active);
    if (hasActiveCombat) {
      return res.status(409).json({
        message: "Não é possível remover personagem em combate ativo",
      });
    }

    // Cascata completa em transação (formas primeiro, principal por último).
    // Ordem importa por causa das FKs:
    // 1. Limpar FKs auto-referenciadas (dodge/block/counter) deste e de outros characters
    // 2. RollResultDetail (FK required → RollResult)
    // 3. ActionLog (referencia character/target/roll/turn)
    // 4. CharacterEffect, RollResult, CombatTurn, CombatParticipant, Inventory
    // 5. ActionPreset (depende de tudo acima estar limpo)
    // 6. Character
    await prisma.$transaction(async (tx) => {
      for (const delId of idsToDelete) {
        // 1. Limpa FKs deste character
        await tx.character.update({
          where: { id: delId },
          data: { dodgePresetId: null, blockPresetId: null, counterAttackPresetId: null },
        });

        // Outros characters podem referenciar presets DESTE character (raro mas possível).
        const myPresets = await tx.actionPreset.findMany({
          where: { characterId: delId },
          select: { id: true },
        });
        const myPresetIds = myPresets.map((p) => p.id);
        if (myPresetIds.length > 0) {
          await tx.character.updateMany({
            where: { dodgePresetId: { in: myPresetIds } },
            data: { dodgePresetId: null },
          });
          await tx.character.updateMany({
            where: { blockPresetId: { in: myPresetIds } },
            data: { blockPresetId: null },
          });
          await tx.character.updateMany({
            where: { counterAttackPresetId: { in: myPresetIds } },
            data: { counterAttackPresetId: null },
          });
        }

        // 2. RollResultDetail (precisa vir antes do RollResult)
        const myRolls = await tx.rollResult.findMany({
          where: { characterId: delId },
          select: { id: true },
        });
        const myRollIds = myRolls.map((r) => r.id);
        if (myRollIds.length > 0) {
          await tx.rollResultDetail.deleteMany({
            where: { rollResultId: { in: myRollIds } },
          });
        }
        // Também details onde o character era TARGET
        await tx.rollResultDetail.deleteMany({ where: { targetId: delId } });

        // 3. ActionLog (autor, alvo, ou ligado a um roll/turn deste character)
        const myTurns = await tx.combatTurn.findMany({
          where: { characterId: delId },
          select: { id: true },
        });
        const myTurnIds = myTurns.map((t) => t.id);
        await tx.actionLog.deleteMany({
          where: {
            OR: [
              { characterId: delId },
              { targetId: delId },
              ...(myRollIds.length > 0 ? [{ rollId: { in: myRollIds } }] : []),
              ...(myTurnIds.length > 0 ? [{ turnId: { in: myTurnIds } }] : []),
            ],
          },
        });

        // 4. Efeitos, rolls, turnos, participants, inventário
        await tx.characterEffect.deleteMany({ where: { characterId: delId } });
        await tx.rollResult.deleteMany({ where: { characterId: delId } });
        await tx.combatTurn.deleteMany({ where: { characterId: delId } });
        await tx.combatParticipant.deleteMany({ where: { characterId: delId } });
        await tx.inventory.deleteMany({ where: { characterId: delId } });

        // 5. Presets (agora sem dependências)
        await tx.actionPreset.deleteMany({ where: { characterId: delId } });

        // 6. Character (limpa referência de forma ativa antes)
        await tx.character.updateMany({
          where: { activeFormId: delId },
          data: { activeFormId: null },
        });
        await tx.character.delete({ where: { id: delId } });
      }
    }, { timeout: 30000 });

    res.status(204).end();
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
