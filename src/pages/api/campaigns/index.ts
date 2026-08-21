import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { campaignSchema } from "../../../validation/campaign";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;

  // LISTAR mesas onde sou mestre OU membro
  if (req.method === "GET") {
    const includeArchived = req.query.includeArchived === "true";
    const campaigns = await prisma.campaign.findMany({
      where: {
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(user.isAdmin
          ? {}
          : {
              OR: [
                { masterId: user.userId },
                { members: { some: { userId: user.userId } } },
              ],
            }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        master: { select: { id: true, username: true } },
        members: {
          include: { user: { select: { id: true, username: true } } },
        },
        invites: {
          where: { active: true },
          orderBy: { createdAt: "desc" },
        },
        customAttributes: { orderBy: { sortOrder: "asc" } },
        _count: { select: { characters: true, combats: true } },
      },
    });

    res.status(200).json({ campaigns });
    return;
  }

  // CRIAR mesa
  // - Apenas admins podem criar mesas
  // - Admin pode passar `masterId` para atribuir a mesa a outro usuário,
  //   promovendo o alvo a MESTRE se ainda for JOGADOR.
  if (req.method === "POST") {
    if (!user.isAdmin) {
      res.status(403).json({ message: "Apenas administradores podem criar mesas" });
      return;
    }

    const rawMasterId = req.body?.masterId;
    const wantsAssignMaster = typeof rawMasterId === "string" && rawMasterId.trim().length > 0;

    if (!wantsAssignMaster) {
      res.status(400).json({ message: "masterId é obrigatório" });
      return;
    }

    let validated;
    try {
      validated = await campaignSchema.validate(req.body ?? {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Dados inválidos";
      res.status(400).json({ message: msg });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: rawMasterId.trim() },
      select: { id: true, role: true },
    });
    if (!target) {
      res.status(404).json({ message: "Usuário alvo não encontrado" });
      return;
    }
    if (target.role !== "MESTRE") {
      await prisma.user.update({
        where: { id: target.id },
        data: { role: "MESTRE" },
      });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: validated.name,
        description: validated.description ?? null,
        image: req.body?.image ?? null,
        archivedAt: null,
        masterId: target.id,
        members: {
          create: { userId: target.id },
        },
      },
      include: {
        master: { select: { id: true, username: true } },
        members: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });

    res.status(201).json(campaign);
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
