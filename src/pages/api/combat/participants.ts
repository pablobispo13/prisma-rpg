import type { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { rollDice } from "../../../lib/dice";
import { LogType } from "@prisma/client";
import { notifyCombatUpdate } from "../../../lib/pusher";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const { campaignId, isMaster } = req.campaign!;

    if (!isMaster) {
        return res.status(403).json({ message: "Apenas o mestre pode adicionar participantes" });
    }

    const { combatId, characterId } = req.body;

    if (!combatId || !characterId) {
        return res.status(400).json({ message: "combatId e characterId são obrigatórios" });
    }

    const combat = await prisma.combat.findUnique({
        where: { id: combatId, active: true },
        include: { participants: true },
    });

    if (!combat || combat.campaignId !== campaignId) {
        return res.status(404).json({ message: "Combate ativo não encontrado" });
    }

    const alreadyIn = combat.participants.some((p) => p.characterId === characterId);
    if (alreadyIn) {
        return res.status(400).json({ message: "Personagem já está no combate" });
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character || character.campaignId !== campaignId) {
        return res.status(404).json({ message: "Personagem não encontrado nesta mesa" });
    }

    const roll = rollDice("1d20");
    const initiative = roll.total + character.agility;

    const maxTurnOrder = combat.participants.reduce(
        (max, p) => Math.max(max, p.turnOrder ?? 0),
        -1
    );

    const newParticipant = await prisma.combatParticipant.create({
        data: {
            combatId,
            characterId,
            currentLife: character.life,
            initiative,
            turnOrder: maxTurnOrder + 1,
        },
        include: {
            character: {
                include: { presets: true, statusEffects: true, owner: { select: { role: true } } },
            },
        },
    });

    await prisma.actionLog.create({
        data: {
            type: LogType.COMBAT_START,
            message: `${character.name} entrou no combate (iniciativa: ${initiative})`,
            characterId,
            combatId,
        },
    });

    notifyCombatUpdate(combatId);
    return res.status(201).json({ participant: newParticipant });
}

export default withCampaign(handler);
