import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getCampaignAccess } from "../../../../../lib/campaignAccess";
import { normalizeBaseAttribute } from "../../../../../lib/skills";

/**
 * PATCH  /api/campaigns/[id]/skills/[skillId] — edita label/baseAttribute/
 *        description/sortOrder (só o mestre). A `key` é imutável: é ela que
 *        indexa o bônus em Character.skills.
 * DELETE /api/campaigns/[id]/skills/[skillId] — remove a perícia e o bônus
 *        correspondente de todos os personagens da mesa (só o mestre).
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { id, skillId } = req.query;
  if (typeof id !== "string" || typeof skillId !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }

  const access = await getCampaignAccess(user, id);
  if (!access) {
    res.status(404).json({ message: "Mesa não encontrada" });
    return;
  }
  if (!access.isMaster) {
    res.status(403).json({ message: "Apenas o mestre da mesa pode editar perícias" });
    return;
  }

  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill || skill.campaignId !== id) {
    res.status(404).json({ message: "Perícia não encontrada" });
    return;
  }

  if (req.method === "PATCH") {
    const { label, baseAttribute, description, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (label !== undefined) {
      if (typeof label !== "string" || !label.trim()) {
        res.status(400).json({ message: "label inválido" });
        return;
      }
      data.label = label.trim();
    }
    if (baseAttribute !== undefined) {
      const attr = normalizeBaseAttribute(baseAttribute);
      if (!attr) {
        res.status(400).json({ message: "baseAttribute inválido" });
        return;
      }
      data.baseAttribute = attr;
    }
    if (description !== undefined) {
      data.description = typeof description === "string" && description.trim() ? description.trim() : null;
    }
    if (sortOrder !== undefined) {
      const n = Number(sortOrder);
      if (!Number.isInteger(n)) {
        res.status(400).json({ message: "sortOrder deve ser um inteiro" });
        return;
      }
      data.sortOrder = n;
    }

    const updated = await prisma.skill.update({ where: { id: skillId }, data });
    res.status(200).json(updated);
    return;
  }

  if (req.method === "DELETE") {
    const characters = await prisma.character.findMany({
      where: { campaignId: id },
      select: { id: true, skills: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.skill.delete({ where: { id: skillId } });
      await Promise.all(
        characters.map((c) => {
          const current = (c.skills as Record<string, number> | null) ?? {};
          if (!(skill.key in current)) return Promise.resolve();
          const rest = { ...current };
          delete rest[skill.key];
          return tx.character.update({ where: { id: c.id }, data: { skills: rest } });
        })
      );
    });

    res.status(204).end();
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
