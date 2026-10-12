import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getCampaignAccess } from "../../../../../lib/campaignAccess";
import { DEFAULT_SKILLS, normalizeBaseAttribute, slugifySkillKey } from "../../../../../lib/skills";

/**
 * GET  /api/campaigns/[id]/skills — lista as perícias da mesa (qualquer membro).
 * POST /api/campaigns/[id]/skills — cria uma perícia (só o mestre).
 *      Body: { label, baseAttribute, description? } ou { seedDefaults: true }
 *      para criar a lista padrão (DEFAULT_SKILLS), pulando as que já existem.
 *      Não precisa mexer nos personagens: bônus ausente = 0 (ver Character.skills).
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { id } = req.query;
  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }

  const access = await getCampaignAccess(user, id);
  if (!access) {
    res.status(404).json({ message: "Mesa não encontrada" });
    return;
  }

  if (req.method === "GET") {
    const skills = await prisma.skill.findMany({
      where: { campaignId: id },
      orderBy: { sortOrder: "asc" },
    });
    res.status(200).json({ skills });
    return;
  }

  if (req.method === "POST") {
    if (!access.isMaster) {
      res.status(403).json({ message: "Apenas o mestre da mesa pode criar perícias" });
      return;
    }

    const { label, baseAttribute, description, seedDefaults } = req.body ?? {};

    const existing = await prisma.skill.findMany({
      where: { campaignId: id },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((s) => s.key));

    if (seedDefaults) {
      const toCreate = DEFAULT_SKILLS
        .map((s) => ({ ...s, key: slugifySkillKey(s.label) }))
        .filter((s) => !existingKeys.has(s.key));

      await prisma.skill.createMany({
        data: toCreate.map((s, index) => ({
          campaignId: id,
          key: s.key,
          label: s.label,
          baseAttribute: s.baseAttribute,
          sortOrder: existing.length + index,
        })),
      });

      const skills = await prisma.skill.findMany({
        where: { campaignId: id },
        orderBy: { sortOrder: "asc" },
      });
      res.status(201).json({ skills, created: toCreate.length });
      return;
    }

    if (typeof label !== "string" || !label.trim()) {
      res.status(400).json({ message: "label é obrigatório" });
      return;
    }
    const key = slugifySkillKey(label);
    if (!key) {
      res.status(400).json({ message: "Nome inválido — use pelo menos uma letra" });
      return;
    }
    const attr = normalizeBaseAttribute(baseAttribute);
    if (!attr) {
      res.status(400).json({ message: "baseAttribute deve ser STRENGTH, AGILITY, VIGOR, INTELLECT ou PRESENCE" });
      return;
    }
    if (existingKeys.has(key)) {
      res.status(409).json({ message: `Já existe uma perícia com o nome "${label.trim()}" nesta mesa` });
      return;
    }

    const created = await prisma.skill.create({
      data: {
        campaignId: id,
        key,
        label: label.trim(),
        baseAttribute: attr,
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        sortOrder: existing.length,
      },
    });

    res.status(201).json(created);
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
