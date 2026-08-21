import type { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        res.status(405).end();
        return;
    }

    const { campaignId } = req.campaign!;

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { screenShareActive: true, screenShareSessionId: true, masterId: true },
    });

    return res.status(200).json({
        active: campaign?.screenShareActive ?? false,
        sessionId: campaign?.screenShareSessionId ?? null,
        masterId: campaign?.masterId ?? null,
    });
}

export default withCampaign(handler);
