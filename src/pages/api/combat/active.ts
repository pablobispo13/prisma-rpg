// pages/api/combat/active.ts
import type { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { hideCharacterSanity } from "../../../lib/campaignAccess";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        res.status(405).end();
        return;
    }

    const user = req.user!;
    const { campaignId, isMaster } = req.campaign!;

    const baseWhere = { active: true, campaignId };

    const combats =
        isMaster
            ? await prisma.combat.findMany({
                where: baseWhere,
                include: {
                    participants: { include: { character: true } },
                },
            })
            : await prisma.combat.findMany({
                where: {
                    ...baseWhere,
                    participants: {
                        some: { character: { ownerId: user.userId } },
                    },
                },
                include: {
                    participants: { include: { character: true } },
                },
            });

    const sanitized = combats.map((c) => ({
        ...c,
        participants: c.participants.map((p) => ({
            ...p,
            character: hideCharacterSanity(p.character, isMaster),
        })),
    }));

    return res.status(200).json(sanitized);
}

export default withCampaign(handler);
