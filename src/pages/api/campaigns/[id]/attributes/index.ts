import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getCampaignAccess } from "../../../../../lib/campaignAccess";
import { slugifyAttributeKey, isReservedAttributeKey, attributeTestPresetSeed } from "../../../../../lib/customAttributes";

/**
 * GET  /api/campaigns/[id]/attributes — lista os atributos customizados da mesa
 *      (qualquer membro pode ver — precisa pra renderizar a ficha/presets).
 * POST /api/campaigns/[id]/attributes — cria um atributo novo (só o mestre).
 *      Aplica retroativamente: todo personagem já existente da mesa ganha a
 *      chave com o valor padrão, e recebe um preset "Teste <Label>" automático
 *      (mesmo padrão dos 5 atributos fixos — ver characterArchetypes.ts).
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
    const attributes = await prisma.customAttribute.findMany({
      where: { campaignId: id },
      orderBy: { sortOrder: "asc" },
    });
    res.status(200).json({ attributes });
    return;
  }

  if (req.method === "POST") {
    if (!access.isMaster) {
      res.status(403).json({ message: "Apenas o mestre da mesa pode criar atributos" });
      return;
    }

    const { label, defaultValue } = req.body ?? {};
    if (typeof label !== "string" || !label.trim()) {
      res.status(400).json({ message: "label é obrigatório" });
      return;
    }

    const key = slugifyAttributeKey(label);
    if (!key) {
      res.status(400).json({ message: "Nome inválido — use pelo menos uma letra (sem acento)" });
      return;
    }
    if (isReservedAttributeKey(key)) {
      res.status(400).json({ message: `"${label}" colide com um atributo fixo ou variável de fórmula reservada` });
      return;
    }

    let defaultValueNum = 0;
    if (defaultValue !== undefined && defaultValue !== null && defaultValue !== "") {
      const n = Number(defaultValue);
      if (!Number.isInteger(n)) {
        res.status(400).json({ message: "defaultValue deve ser um inteiro" });
        return;
      }
      defaultValueNum = n;
    }

    const existing = await prisma.customAttribute.findUnique({
      where: { campaignId_key: { campaignId: id, key } },
    });
    if (existing) {
      res.status(409).json({ message: `Já existe um atributo com o nome "${existing.label}" nesta mesa` });
      return;
    }

    const count = await prisma.customAttribute.count({ where: { campaignId: id } });

    const created = await prisma.customAttribute.create({
      data: {
        campaignId: id,
        key,
        label: label.trim(),
        defaultValue: defaultValueNum,
        sortOrder: count,
      },
    });

    // Retroatividade: todo personagem já existente ganha a chave (valor
    // padrão) e um preset de teste automático — mesmo efeito de quem já
    // tivesse esse atributo desde a criação da ficha.
    const characters = await prisma.character.findMany({
      where: { campaignId: id },
      select: { id: true, customAttributes: true },
    });

    await Promise.all(
      characters.map(async (c) => {
        const current = (c.customAttributes as Record<string, number> | null) ?? {};
        if (!(created.key in current)) {
          await prisma.character.update({
            where: { id: c.id },
            data: { customAttributes: { ...current, [created.key]: created.defaultValue } },
          });
        }
        await prisma.actionPreset.create({
          data: { ...attributeTestPresetSeed(created.key, created.label), characterId: c.id },
        });
      })
    );

    res.status(201).json(created);
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
