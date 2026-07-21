import type { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { isNpc } from "../../../lib/isNpc";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        res.status(405).end();
        return;
    }

    const { campaignId, isMaster } = req.campaign!;
    const user = req.user!;
    const { limit = 20, skip = 0 } = req.query;

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { masterId: true },
    });
    const masterId = campaign?.masterId ?? null;

    const where =
        isMaster
            ? { active: false, campaignId }
            : {
                active: false,
                campaignId,
                participants: {
                    some: { character: { ownerId: user.userId } },
                },
            };

    const combats = await prisma.combat.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Number(limit),
        skip: Number(skip),
        include: {
            participants: {
                include: {
                    character: { select: { id: true, name: true, maxLife: true, ownerId: true } },
                },
            },
            logs: {
                orderBy: { createdAt: "asc" },
                select: { id: true, type: true, message: true, createdAt: true, masterOnly: true },
            },
            rollResults: {
                select: {
                    id: true,
                    characterId: true,
                    damage: true,
                    healing: true,
                    success: true,
                    critical: true,
                    character: { select: { id: true, name: true, ownerId: true } },
                },
            },
        },
    });

    // Compute per-combat stats from rollResults
    const combatsWithStats = combats.map((combat) => {
        const statsByChar: Record<string, { name: string; isNpc: boolean; totalDamage: number; totalHealing: number; hits: number; misses: number; maxHit: number }> = {};
        for (const r of combat.rollResults) {
            const charId = r.characterId;
            if (!statsByChar[charId]) {
                statsByChar[charId] = { name: r.character.name, isNpc: isNpc(r.character, masterId), totalDamage: 0, totalHealing: 0, hits: 0, misses: 0, maxHit: 0 };
            }
            if (r.success === true) statsByChar[charId].hits++;
            else if (r.success === false) statsByChar[charId].misses++;
            if (r.damage) {
                statsByChar[charId].totalDamage += r.damage;
                statsByChar[charId].maxHit = Math.max(statsByChar[charId].maxHit, r.damage);
            }
            if (r.healing) {
                statsByChar[charId].totalHealing += r.healing;
            }
        }

        return {
            ...combat,
            // Ajustes manuais do mestre ficam ocultos para jogadores
            logs: isMaster ? combat.logs : combat.logs.filter((l) => l.masterOnly !== true),
            stats: {
                rounds: combat.round,
                participants: Object.entries(statsByChar).map(([id, s]) => ({ id, ...s })),
            },
        };
    });

    return res.status(200).json({ combats: combatsWithStats });
}

export default withCampaign(handler);
