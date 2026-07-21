import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { ActionType, AttributeType, EffectType, TargetType, ResolutionType, EffectSelectionMode, EffectTarget, StatusType } from "@prisma/client";
import { canActOnCharacter } from "../../../lib/campaignAccess";

// Normaliza as linhas de efeito recebidas do front para o formato do banco
export function sanitizePresetEffects(effects: unknown): Array<{
  name: string;
  description: string | null;
  effectType: EffectType;
  target: EffectTarget;
  value: number | null;
  valueFormula: string | null;
  statAffected: AttributeType | null;
  statusApplied: StatusType | null;
  durationTurns: number | null;
  retestEachRound: boolean;
  contestDecay: number | null;
  sortOrder: number;
}> | null {
  if (!Array.isArray(effects)) return null;
  return effects.map((e: any, index: number) => {/* eslint-disable-line @typescript-eslint/no-explicit-any */
    if (!e?.name || !e?.effectType) {
      throw new Error("Cada efeito precisa de name e effectType");
    }
    return {
      name: String(e.name),
      description: e.description ? String(e.description) : null,
      effectType: e.effectType as EffectType,
      target: (e.target as EffectTarget) ?? EffectTarget.TARGETS,
      value: e.value ?? null,
      valueFormula: e.valueFormula ? String(e.valueFormula) : null,
      statAffected: (e.statAffected as AttributeType) ?? null,
      statusApplied: (e.statusApplied as StatusType) ?? null,
      durationTurns: e.durationTurns ?? null,
      retestEachRound: Boolean(e.retestEachRound),
      contestDecay: e.contestDecay ?? null,
      sortOrder: e.sortOrder ?? index,
    };
  });
}

// null/"" = ilimitado; senão precisa ser inteiro >= 1
export function normalizeUsesPerDay(value: unknown): number | null | undefined {
  if (value === undefined) return undefined; // não altera (PUT parcial)
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("usesPerDay deve ser um inteiro >= 1 (ou vazio para ilimitado)");
  }
  return n;
}


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
        effects: { orderBy: { sortOrder: "asc" } },
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
      resolution,
      contestAttribute,
      effectSelectionMode,
      effects,
      usesPerDay,
      targetFormId,
    } = req.body;

    if (!name || !type || !targetType || !diceFormula || !attribute || !characterId) {
      res.status(400).json({ message: "Dados obrigatórios ausentes" });
      return;
    }

    if (!(await canActOnCharacter(user, characterId))) {
      res.status(403).json({ message: "Sem permissão" });
      return;
    }

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

    const preset = await prisma.actionPreset.create({
      data: {
        resolution: resolution ? (resolution as ResolutionType) : undefined,
        contestAttribute: contestAttribute ? (contestAttribute as AttributeType) : null,
        effectSelectionMode: effectSelectionMode ? (effectSelectionMode as EffectSelectionMode) : undefined,
        usesPerDay: usesPerDayValue,
        ...(effectRows && effectRows.length > 0
          ? { effects: { create: effectRows } }
          : {}),
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
        // Só relevante quando type=TRANSFORM (forma-alvo; null = volta à base)
        targetFormId: type === "TRANSFORM" && targetFormId ? targetFormId : null,
        characterId,
        durationTurns: durationTurns ?? null,
        statAffected: statAffected ?? null,
        effectAmount: effectAmount ?? null,
        effectType: effectType ? (effectType as EffectType) : null,
        statusApplied: statusApplied ?? null,
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


    res.status(201).json(preset);
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
