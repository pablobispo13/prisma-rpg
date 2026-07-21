// pages/api/actionPreset/[id].ts
import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { ActionType, AttributeType, EffectType, TargetType, ResolutionType, EffectSelectionMode } from "@prisma/client";
import { sanitizePresetEffects, normalizeUsesPerDay } from "./index";


async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  const user = req.user!;

  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }

  const preset = await prisma.actionPreset.findUnique({
    where: { id },
    include: { character: true },
  });

  if (!preset) {
    res.status(404).json({ message: "Preset não encontrado" });
    return;
  }

  const character = preset.character;
  if (!character) {
    res.status(404).json({ message: "Personagem não encontrado" });
    return;
  }

  const { canActOnCharacter } = await import("../../../lib/campaignAccess");
  if (!(await canActOnCharacter(user, character.id))) {
    res.status(403).json({ message: "Sem permissão" });
    return;
  }

  // 🔍 GET
  if (req.method === "GET") {
    const fullPreset = await prisma.actionPreset.findUnique({
      where: { id },
      include: {
        effects: { orderBy: { sortOrder: "asc" } },
        characterEffects: true,
        dodgeCharacters: true,
        blockCharacters: true,
        counterAttackCharacters: true,
        rolls: true,
        inventories: true,
        character: true,
      },
    });

    res.status(200).json({ preset: fullPreset });
    return;
  }

  // ✏️ PUT — ATUALIZAR PRESET
  if (req.method === "PUT") {
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
      durationTurns,
      statAffected,
      effectAmount,
      effectType,
      statusApplied,
      resolution,
      contestAttribute,
      effectSelectionMode,
      effects,
      usesPerDay,
    } = req.body;

    // `effects` presente = substituição completa das linhas de efeito
    let effectRows;
    try {
      effectRows = sanitizePresetEffects(effects);
    } catch (e) {
      res.status(400).json({ message: (e as Error).message });
      return;
    }

    let usesPerDayValue: number | null | undefined;
    try {
      usesPerDayValue = normalizeUsesPerDay(usesPerDay);
    } catch (e) {
      res.status(400).json({ message: (e as Error).message });
      return;
    }

    if (effectRows) {
      await prisma.presetEffect.deleteMany({ where: { presetId: id } });
    }

    const updatedPreset = await prisma.actionPreset.update({
      where: { id },
      data: {
        resolution: resolution ? (resolution as ResolutionType) : undefined,
        contestAttribute: contestAttribute !== undefined ? (contestAttribute as AttributeType | null) : undefined,
        effectSelectionMode: effectSelectionMode ? (effectSelectionMode as EffectSelectionMode) : undefined,
        usesPerDay: usesPerDayValue,
        ...(effectRows ? { effects: { create: effectRows } } : {}),
        name: name ?? undefined,
        description: description ?? undefined,
        type: type ? (type as ActionType) : undefined,
        targetType: targetType ? (targetType as TargetType) : undefined,
        diceFormula: diceFormula ?? undefined,
        impactFormula: impactFormula ?? undefined,
        modifier: modifier ?? undefined,
        critThreshold: critThreshold ?? undefined,
        critMultiplier: critMultiplier ?? undefined,
        requiresTurn: requiresTurn ?? undefined,
        allowOutOfCombat: allowOutOfCombat ?? undefined,
        appliesEffect: appliesEffect ?? undefined,
        isAreaEffect: isAreaEffect ?? undefined,
        transformedOnly: transformedOnly ?? undefined,
        attribute: attribute ? (attribute as AttributeType) : undefined,
        durationTurns: durationTurns ?? undefined,
        statAffected: statAffected ?? undefined,
        effectAmount: effectAmount ?? undefined,
        effectType: effectType !== undefined ? (effectType as EffectType | null) : undefined,
        statusApplied: statusApplied ?? undefined,
      },
      include: {
        effects: { orderBy: { sortOrder: "asc" } },
        characterEffects: true,
        dodgeCharacters: true,
        blockCharacters: true,
        counterAttackCharacters: true,
        rolls: true,
        inventories: true,
      },
    });

   
    res.status(200).json(updatedPreset);
    return;
  }

  // 🗑 DELETE
  if (req.method === "DELETE") {
    await prisma.actionPreset.delete({ where: { id } });
   
    res.status(204).end();
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
