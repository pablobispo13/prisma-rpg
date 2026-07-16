import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { ActionType, AttributeType, EffectType, TargetType } from "@prisma/client";
import { canActOnCharacter } from "../../../lib/campaignAccess";


async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;

  // LISTAR PRESETS
  if (req.method === "GET") {
    const { characterId } = req.query;

    if (typeof characterId !== "string") {
      res.status(400).json({ message: "characterId é obrigatório" });
      return;
    }

    if (!(await canActOnCharacter(user, characterId))) {
      res.status(403).json({ message: "Sem acesso a este personagem" });
      return;
    }

    const presets = await prisma.actionPreset.findMany({
      where: { characterId },
      orderBy: { name: "asc" },
      include: {
        characterEffects: true,
        dodgeCharacters: true,
        blockCharacters: true,
        counterAttackCharacters: true,
        rolls: true,
        inventories: true,
      },

    });

    res.status(200).json({ presets });
    return;
  }

  // CRIAR PRESET
  if (req.method === "POST") {
    const {
      name,
      description,
      type,
      targetType,
      diceFormula,
      impactFormula,
      modifier,
      critThreshold,
      critMultiplier,
      requiresTurn,
      allowOutOfCombat,
      appliesEffect,
      isAreaEffect,
      transformedOnly,
      attribute,
      characterId,
      durationTurns,
      statAffected,
      effectAmount,
      effectType,
      statusApplied,
    } = req.body;

    if (!name || !type || !targetType || !diceFormula || !attribute || !characterId) {
      res.status(400).json({ message: "Dados obrigatórios ausentes" });
      return;
    }

    if (!(await canActOnCharacter(user, characterId))) {
      res.status(403).json({ message: "Sem permissão" });
      return;
    }

    const preset = await prisma.actionPreset.create({
      data: {
        name,
        description,
        type: type as ActionType,
        targetType: targetType as TargetType,
        diceFormula,
        impactFormula,
        modifier: modifier ?? 0,
        critThreshold,
        critMultiplier,
        requiresTurn: requiresTurn ?? true,
        allowOutOfCombat: allowOutOfCombat ?? false,
        appliesEffect: appliesEffect ?? true,
        isAreaEffect: isAreaEffect ?? false,
        transformedOnly: transformedOnly ?? false,
        attribute: attribute as AttributeType,
        characterId,
        durationTurns: durationTurns ?? null,
        statAffected: statAffected ?? null,
        effectAmount: effectAmount ?? null,
        effectType: effectType ? (effectType as EffectType) : null,
        statusApplied: statusApplied ?? null,
      },
      include: {
        characterEffects: true,
        dodgeCharacters: true,
        blockCharacters: true,
        counterAttackCharacters: true,
        rolls: true,
        inventories: true,
      },
    });


    res.status(201).json(preset);
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
