import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { getPusher } from "../../../lib/pusher";
import { getCampaignAccess } from "../../../lib/campaignAccess";

// Autoriza a subscrição de um usuário autenticado a canais privados do Pusher.
// Hoje só o canal de sinalização do compartilhamento de tela é privado
// (private-campaign-{id}-screenshare-signal) — os demais canais do app
// continuam públicos.
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    const { socket_id: socketId, channel_name: channelName } = req.body;
    if (!socketId || !channelName) {
        return res.status(400).json({ message: "socket_id e channel_name são obrigatórios" });
    }

    const match = /^private-campaign-([^-]+)-screenshare-signal$/.exec(channelName);
    if (!match) {
        return res.status(403).json({ message: "Canal não autorizável" });
    }

    const campaignId = match[1];
    const access = await getCampaignAccess(req.user!, campaignId);
    if (!access) {
        return res.status(403).json({ message: "Sem acesso a esta mesa" });
    }

    const pusher = getPusher();
    if (!pusher) {
        return res.status(500).json({ message: "Pusher não configurado" });
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName);
    return res.status(200).json(authResponse);
}

export default authenticate(handler);
