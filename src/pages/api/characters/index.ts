import { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { Prisma } from "@prisma/client";
import { hideCharacterSanity } from "../../../lib/campaignAccess";
import { sanitizeCustomAttributeValues } from "../../../lib/customAttributes";

// Includes compartilhados entre a listagem e a substituição por forma ativa
const masterInclude = {
  owner: true,
  presets: {
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
  },
  inventory: { orderBy: { name: "desc" } },
  dodgePreset: true,
  blockPreset: true,
  counterAttackPreset: true,
  actionLogs: {
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      roll: { include: { preset: true } },
      character: true,
      target: true,
    },
  },
  targetLogs: true,
  combatParticipants: true,
  turns: true,
  rollResults: { include: { preset: true, logs: true } },
  statusEffects: true,
} satisfies Prisma.CharacterInclude;

const playerInclude = {
  owner: true,
  dodgePreset: true,
  blockPreset: true,
  counterAttackPreset: true,
  targetLogs: true,
  combatParticipants: true,
  turns: true,
  rollResults: { include: { preset: true, logs: true } },
  statusEffects: true,
} satisfies Prisma.CharacterInclude;

const formsSelect = {
  forms: { select: { id: true, name: true, image: true } },
} as const;

type FormOption = { id: string; name: string; image: string | null };

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { campaignId, isMaster } = req.campaign!;

  // LISTAR PERSONAGENS da mesa (apenas fichas principais; formas ficam ocultas)
  if (req.method === "GET") {
    const include = isMaster ? masterInclude : playerInclude;

    const characters = await prisma.character.findMany({
      where: {
        campaignId,
        // Mongo: personagens antigos não têm o campo — "ausente" não casa com null
        OR: [{ primaryFormId: null }, { primaryFormId: { isSet: false } }],
        ...(isMaster ? {} : { ownerId: user.userId }),
      },
      orderBy: { name: "asc" },
      include: { ...include, ...formsSelect },
    });

    // Personagens transformados: retorna a ficha da forma ativa no lugar da
    // principal, com metadados do grupo de formas para o front trocar
    const activeFormIds = characters
      .map((c) => c.activeFormId)
      .filter((id): id is string => !!id);

    const activeForms = activeFormIds.length
      ? await prisma.character.findMany({
          where: { id: { in: activeFormIds } },
          include,
        })
      : [];
    const activeFormById = new Map(activeForms.map((f) => [f.id, f]));

    const result = characters.map((c) => {
      const { forms, ...primary } = c;
      const options: FormOption[] = [
        { id: primary.id, name: primary.name, image: primary.image },
        ...forms,
      ];
      const formGroup =
        forms.length > 0
          ? { primaryId: primary.id, activeId: primary.activeFormId ?? primary.id, options }
          : null;

      const activeForm = primary.activeFormId
        ? activeFormById.get(primary.activeFormId)
        : null;

      return activeForm ? { ...activeForm, formGroup } : { ...primary, formGroup };
    });

    res.status(200).json({ characters: result.map((c) => hideCharacterSanity(c, isMaster)) });
    return;
  }

  // CRIAR PERSONAGEM dentro da mesa
  if (req.method === "POST") {
    // Jogador (não-mestre desta mesa) só pode ter um personagem por mesa
    if (!isMaster) {
      const existing = await prisma.character.findFirst({
        where: {
          ownerId: user.userId,
          campaignId,
          OR: [{ primaryFormId: null }, { primaryFormId: { isSet: false } }],
        },
      });
      if (existing) {
        res.status(400).json({ message: "Você já possui um personagem nesta mesa" });
        return;
      }
    }

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
      dodgePresetId,
      blockPresetId,
      counterAttackPresetId,
      customAttributes,
    } = req.body;

    // Atributos customizados da mesa: começam no defaultValue configurado
    // pelo mestre, sobrescrito por valores enviados no body (se houver)
    const customAttributeDefs = await prisma.customAttribute.findMany({
      where: { campaignId },
      select: { key: true, defaultValue: true },
    });
    const sanitizedCustom = sanitizeCustomAttributeValues(
      customAttributes,
      new Set(customAttributeDefs.map((a) => a.key))
    );
    const customAttributesValue = Object.fromEntries(
      customAttributeDefs.map((a) => [a.key, sanitizedCustom[a.key] ?? a.defaultValue])
    );

    const character = await prisma.character.create({
      data: {
        name: name ?? "Novo Personagem",
        life: life ?? 100,
        maxLife: maxLife ?? life ?? 100,
        xp: xp ?? 0,
        strength: strength ?? 10,
        agility: agility ?? 10,
        vigor: vigor ?? 10,
        intellect: intellect ?? 10,
        presence: presence ?? 10,
        customAttributes: customAttributesValue,
        baseDefense: baseDefense ?? 0,
        history: history ?? "",
        notes: notes ?? "",
        ownerId: user.userId,
        campaignId,
        dodgePresetId: dodgePresetId ?? null,
        blockPresetId: blockPresetId ?? null,
        counterAttackPresetId: counterAttackPresetId ?? null,
      },
      include: masterInclude,
    });

    res.status(201).json(hideCharacterSanity(character, isMaster));
    return;
  }

  res.status(405).end();
}

export default withCampaign(handler);
