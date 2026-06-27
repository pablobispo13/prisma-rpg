import { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { campaignId, isMaster } = req.campaign!;

  // LISTAR PERSONAGENS da mesa
  if (req.method === "GET") {
    const characters =
      isMaster
        ? await prisma.character.findMany({
            where: { campaignId },
            orderBy: { name: "asc" },
            include: {
              owner: true,
              presets: {
                orderBy: { name: "asc" },
                include: {
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
            },
          })
        : await prisma.character.findMany({
            where: { campaignId, ownerId: user.userId },
            orderBy: { name: "asc" },
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

    res.status(200).json({ characters });
    return;
  }

  // CRIAR PERSONAGEM dentro da mesa
  if (req.method === "POST") {
    // Jogador (não-mestre desta mesa) só pode ter um personagem por mesa
    if (!isMaster) {
      const existing = await prisma.character.findFirst({
        where: { ownerId: user.userId, campaignId },
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
    } = req.body;

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
        baseDefense: baseDefense ?? 0,
        history: history ?? "",
        notes: notes ?? "",
        ownerId: user.userId,
        campaignId,
        dodgePresetId: dodgePresetId ?? null,
        blockPresetId: blockPresetId ?? null,
        counterAttackPresetId: counterAttackPresetId ?? null,
      },
      include: {
        owner: true,
        presets: {
          orderBy: { name: "asc" },
          include: {
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
      },
    });

    res.status(201).json(character);
    return;
  }

  res.status(405).end();
}

export default withCampaign(handler);
