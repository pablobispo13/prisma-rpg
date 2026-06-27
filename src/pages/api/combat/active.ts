// pages/api/combat/active.ts
import type { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

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

    return res.status(200).json(combats);
}

export default withCampaign(handler);
