import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getCampaignAccess } from "../../../../../lib/campaignAccess";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.status(405).end();
    return;
  }

  const user = req.user!;
  const { id, userId } = req.query;
  if (typeof id !== "string" || typeof userId !== "string") {
    res.status(400).json({ message: "Parâmetros inválidos" });
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { masterId: true, archivedAt: true },
  });
  if (!campaign) {
    res.status(404).json({ message: "Mesa não encontrada" });
    return;
  }

  const isMasterOfCampaign = campaign.masterId === user.userId;

  // Apenas o mestre da mesa pode remover membros; qualquer um pode sair de si mesmo
  if (!isMasterOfCampaign && userId !== user.userId) {
    res.status(403).json({ message: "Apenas o mestre da mesa pode remover membros" });
    return;
  }

  // Não permite remover o próprio mestre da mesa
  if (campaign.masterId === userId) {
    res.status(400).json({ message: "Não é possível remover o mestre da mesa" });
    return;
  }

  await prisma.campaignMember.deleteMany({
    where: { campaignId: id, userId },
  });

  res.status(204).end();
}

export default authenticate(handler);
