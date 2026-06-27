import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { EffectType, LogType } from "@prisma/client";
import { canActOnCharacter, getCampaignAccess, getCharacterCampaign } from "../../../lib/campaignAccess";


async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    const user = req.user!;
    if (req.method === "GET") {
        const { characterId } = req.query;

        if (typeof characterId !== "string") {
            res.status(400).json({ message: "characterId obrigatório" });
            return;
        }

        if (!(await canActOnCharacter(user, characterId))) {
            res.status(403).json({ message: "Sem acesso a este personagem" });
            return;
        }

        const effects = await prisma.characterEffect.findMany({
            where: {
                characterId,
                remainingTurns: { gt: 0 },
            },
            include: {
                preset: true,
            },
        });

        return res.status(200).json({ effects });
    }
    if (req.method === "POST") {
        const {
            characterId,
            presetId,
            durationTurns,
            value,
            statAffected,
            statusApplied,
        } = req.body;

        if (!characterId || !presetId || !durationTurns) {
            res.status(400).json({ message: "Dados obrigatórios ausentes" });
            return;
        }
        const campaignId = await getCharacterCampaign(characterId);
        const access = campaignId ? await getCampaignAccess(user, campaignId) : null;
        if (!access?.isMaster) {
            res.status(403).json({ message: "Apenas o mestre pode aplicar status manualmente" });
            return;
        }

        const effect = await prisma.characterEffect.create({
            data: {
                characterId,
                presetId,
                remainingTurns: durationTurns,
                value: value ?? 0,
                statAffected: statAffected ?? null,
                statusApplied: statusApplied ?? null,
                type: statAffected
                    ? EffectType.HEAL_OVER_TIME // neutro
                    : EffectType.DAMAGE_OVER_TIME,
            },
        });

        await prisma.actionLog.create({
            data: {
                type: LogType.MANUAL_OVERRIDE,
                message: `Status aplicado manualmente`,
                characterId,
            },
        });

       
        return res.status(201).json(effect);
    }
    if (req.method === "DELETE") {
        const { effectId } = req.body;

        if (!effectId) {
            res.status(400).json({ message: "effectId obrigatório" });
            return;
        }

        const effect = await prisma.characterEffect.findUnique({ where: { id: effectId } });
        if (!effect) {
            res.status(404).json({ message: "Efeito não encontrado" });
            return;
        }

        const campaignId = await getCharacterCampaign(effect.characterId);
        const access = campaignId ? await getCampaignAccess(user, campaignId) : null;
        if (!access?.isMaster) {
            res.status(403).json({ message: "Apenas o mestre pode remover status" });
            return;
        }

        await prisma.characterEffect.delete({
            where: { id: effectId },
        });

        await prisma.actionLog.create({
            data: {
                type: LogType.MANUAL_OVERRIDE,
                message: `Status removido manualmente`,
            },
        });

       
        return res.status(200).json({ message: "Status removido" });
    }
    res.status(405).end();
    return;
}

export default authenticate(handler);
