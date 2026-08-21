import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getCampaignAccess } from "../../../../../lib/campaignAccess";

/**
 * PATCH  /api/campaigns/[id]/attributes/[attributeId] — edita label/defaultValue/
 *        sortOrder (só o mestre). A `key` é imutável após a criação — ela é a
 *        referência usada em presets/fórmulas, trocá-la quebraria tudo que já
 *        aponta pra ela.
 * DELETE /api/campaigns/[id]/attributes/[attributeId] — remove o atributo (só
 *        o mestre). Bloqueado se algum preset/efeito da mesa ainda o usa —
 *        o mestre precisa editar/remover essas referências primeiro.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { id, attributeId } = req.query;
  if (typeof id !== "string" || typeof attributeId !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }

  const access = await getCampaignAccess(user, id);
  if (!access) {
    res.status(404).json({ message: "Mesa não encontrada" });
    return;
  }
  if (!access.isMaster) {
    res.status(403).json({ message: "Apenas o mestre da mesa pode editar atributos" });
    return;
  }

  const attribute = await prisma.customAttribute.findUnique({ where: { id: attributeId } });
  if (!attribute || attribute.campaignId !== id) {
    res.status(404).json({ message: "Atributo não encontrado" });
    return;
  }

  if (req.method === "PATCH") {
    const { label, defaultValue, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (label !== undefined) {
      if (typeof label !== "string" || !label.trim()) {
        res.status(400).json({ message: "label inválido" });
        return;
      }
      data.label = label.trim();
    }
    if (defaultValue !== undefined) {
      const n = Number(defaultValue);
      if (!Number.isInteger(n)) {
        res.status(400).json({ message: "defaultValue deve ser um inteiro" });
        return;
      }
      data.defaultValue = n;
    }
    if (sortOrder !== undefined) {
      const n = Number(sortOrder);
      if (!Number.isInteger(n)) {
        res.status(400).json({ message: "sortOrder deve ser um inteiro" });
        return;
      }
      data.sortOrder = n;
    }

    const updated = await prisma.customAttribute.update({ where: { id: attributeId }, data });
    res.status(200).json(updated);
    return;
  }

  if (req.method === "DELETE") {
    const characters = await prisma.character.findMany({
      where: { campaignId: id },
      select: { id: true, customAttributes: true },
    });
    const characterIds = characters.map((c) => c.id);

    const [presetUse, effectUse, characterEffectUse] = await Promise.all([
      prisma.actionPreset.count({
        where: {
          characterId: { in: characterIds },
          OR: [
            { attribute: attribute.key },
            { contestAttribute: attribute.key },
            { statAffected: attribute.key },
          ],
        },
      }),
      prisma.presetEffect.count({
        where: {
          statAffected: attribute.key,
          preset: { characterId: { in: characterIds } },
        },
      }),
      prisma.characterEffect.count({
        where: {
          characterId: { in: characterIds },
          OR: [{ statAffected: attribute.key }, { contestAttribute: attribute.key }],
        },
      }),
    ]);

    const usageCount = presetUse + effectUse + characterEffectUse;
    if (usageCount > 0) {
      res.status(409).json({
        message: `"${attribute.label}" está em uso em ${usageCount} preset(s)/efeito(s) da mesa — edite ou remova essas referências antes de excluir o atributo`,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.customAttribute.delete({ where: { id: attributeId } });
      await Promise.all(
        characters.map((c) => {
          const current = (c.customAttributes as Record<string, number> | null) ?? {};
          if (!(attribute.key in current)) return Promise.resolve();
          const rest = { ...current };
          delete rest[attribute.key];
          return tx.character.update({ where: { id: c.id }, data: { customAttributes: rest } });
        })
      );
    });

    res.status(204).end();
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
