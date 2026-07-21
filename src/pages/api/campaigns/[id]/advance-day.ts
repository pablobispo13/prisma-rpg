import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { getCampaignAccess } from "../../../../lib/campaignAccess";

/**
 * POST /api/campaigns/[id]/advance-day — o mestre marca que um novo dia
 * se passou no mundo da mesa. Isso libera de novo os usos diários de
 * habilidades (ActionPreset.usesPerDay): cada linha de PresetDailyUsage
 * é escopada ao worldDay em que foi criada, então avançar o dia basta
 * para o próximo uso abrir um contador novo em zero.
 *
 * Body opcional { setDay: number } define o dia diretamente (ex: corrigir
 * um avanço indevido); sem body, incrementa 1 a partir do dia atual (null = 1).
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { id } = req.query;
  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const access = await getCampaignAccess(user, id);
  if (!access || !access.isMaster) {
    res.status(403).json({ message: "Apenas o mestre pode avançar o dia da mesa" });
    return;
  }

  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { worldDay: true } });
  const currentDay = campaign?.worldDay ?? 1;

  const { setDay } = req.body ?? {};
  let nextDay = currentDay + 1;
  if (setDay !== undefined) {
    const n = Number(setDay);
    if (!Number.isInteger(n) || n < 1) {
      res.status(400).json({ message: "setDay deve ser um inteiro >= 1" });
      return;
    }
    nextDay = n;
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { worldDay: nextDay },
    select: { worldDay: true },
  });

  res.status(200).json({ worldDay: updated.worldDay });
}

export default authenticate(handler);
