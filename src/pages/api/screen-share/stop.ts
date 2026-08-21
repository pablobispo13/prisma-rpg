import type { NextApiResponse } from "next";
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
        return res.status(403).json({ message: "Apenas o mestre da mesa pode parar o compartilhamento" });
    }

    const { sessionId } = req.body;

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { screenShareSessionId: true },
    });

    // Uma sessão obsoleta (ex: aba perdedora numa disputa entre abas do
    // mestre) não pode derrubar uma sessão mais nova já em andamento.
    if (sessionId && campaign?.screenShareSessionId && campaign.screenShareSessionId !== sessionId) {
        return res.status(200).json({ message: "Sessão já substituída, nada a fazer" });
    }

    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            screenShareActive: false,
            screenShareSessionId: null,
            screenShareUpdatedAt: new Date(),
        },
    });

    await notifyScreenShareState(campaignId, { active: false, sessionId: null });

    return res.status(200).json({ message: "Compartilhamento encerrado" });
}

export default withCampaign(handler);
