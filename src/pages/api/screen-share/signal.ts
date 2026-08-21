import type { NextApiResponse } from "next";
import { withCampaign, AuthenticatedRequest } from "../../../lib/auth";
import { notifyScreenShareSignal } from "../../../lib/pusher";

// Retransmite mensagens de sinalização WebRTC (offer/answer/ice-candidate/
// viewer-hello) entre o mestre e os jogadores de uma mesa, via canal privado
// do Pusher. O vídeo em si nunca passa por aqui — só metadados de conexão.
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const { campaignId } = req.campaign!;
    const { type, toClientId, fromClientId, sessionId, sdp, candidate } = req.body;

    if (!type || !fromClientId) {
        return res.status(400).json({ message: "type e fromClientId são obrigatórios" });
    }

    await notifyScreenShareSignal(campaignId, {
        type,
        toClientId: toClientId ?? null,
        fromClientId,
        fromUserId: req.user!.userId,
        sessionId: sessionId ?? null,
        sdp: sdp ?? null,
        candidate: candidate ?? null,
    });

    return res.status(200).json({ message: "Sinal retransmitido" });
}

export default withCampaign(handler);
