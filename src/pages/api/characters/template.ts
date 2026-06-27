import { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { ARCHETYPES, Archetype, presetSeedsFor } from "../../../lib/characterArchetypes";

/**
 * Cria um personagem completo (com presets de teste de atributo + reações)
 * em uma única chamada e em uma transação atômica.
 *
 * Substitui a sequência antiga de 10 requests do helper front-end
 * `createCharacterTemplate`, eliminando race conditions e rollback parcial.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const user = req.user!;
  const { campaignId } = req.campaign!;
  const { name, archetype = "PLAYER", overrides } = req.body ?? {};

  if (!ARCHETYPES[archetype as Archetype]) {
    res.status(400).json({ message: "Arquétipo inválido" });
    return;
  }

  const isMasterOfCampaign = req.campaign?.isMaster;

  // Jogador (não-mestre da mesa) só cria um personagem PLAYER por mesa
  if (!isMasterOfCampaign) {
    const existing = await prisma.character.findFirst({
      where: { ownerId: user.userId, campaignId },
    });
    if (existing) {
      res.status(400).json({ message: "Você já possui um personagem nesta mesa" });
      return;
    }
    // Jogador só pode criar PLAYER (não inimigos/bosses)
    if (archetype !== "PLAYER") {
      res.status(403).json({ message: "Apenas o mestre da mesa cria inimigos/NPCs" });
      return;
    }
  }

  const def = ARCHETYPES[archetype as Archetype];
  const baseData = {
    name: name?.trim() || "Novo Personagem",
    ...def.defaults,
    ...(overrides ?? {}),
    xp: 0,
    history: "",
    notes: "",
    ownerId: user.userId,
    campaignId,
  };

  const seeds = presetSeedsFor(archetype as Archetype);

  // Cria character e presets em transação
  const result = await prisma.$transaction(async (tx) => {
    const character = await tx.character.create({ data: baseData });

    const createdPresets = await Promise.all(
      seeds.map((seed) =>
        tx.actionPreset.create({
          data: { ...seed, characterId: character.id },
        })
      )
    );

    // Mapeia reaction presets pelos nomes pra atualizar character
    const dodgeId = createdPresets.find((p) => p.name === "Esquiva")?.id ?? null;
    const blockId = createdPresets.find((p) => p.name === "Bloqueio")?.id ?? null;
    const counterId = createdPresets.find((p) => p.name === "Contra-Ataque")?.id ?? null;

    if (dodgeId || blockId || counterId) {
      await tx.character.update({
        where: { id: character.id },
        data: {
          dodgePresetId: dodgeId,
          blockPresetId: blockId,
          counterAttackPresetId: counterId,
        },
      });
    }

    return tx.character.findUnique({
      where: { id: character.id },
      include: {
        owner: true,
        presets: { orderBy: { name: "asc" } },
        inventory: true,
        dodgePreset: true,
        blockPreset: true,
        counterAttackPreset: true,
      },
    });
  });

  res.status(201).json(result);
}

export default withCampaign(handler);
