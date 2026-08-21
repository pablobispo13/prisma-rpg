import type { NextApiResponse } from "next";
import crypto from "crypto";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { notifyScreenShareState } from "../../../lib/pusher";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const { campaignId, isMaster } = req.campaign!;
    if (!isMaster) {
        return res.status(403).json({ message: "Apenas o mestre da mesa pode compartilhar a tela" });
    }

    const sessionId = crypto.randomUUID();

    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            screenShareActive: true,
            screenShareSessionId: sessionId,
            screenShareUpdatedAt: new Date(),
        },
    });

    await notifyScreenShareState(campaignId, { active: true, sessionId });

    return res.status(200).json({ sessionId });
}

export default withCampaign(handler);
