import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { getCampaignAccess } from "../../../lib/campaignAccess";
import { validateFormula } from "../../../lib/formula";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = req.user!;
  const { id } = req.query;
  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }

  // GET e PATCH permitem ver/editar mesa arquivada (mestre precisa pra restaurar)
  const access = await getCampaignAccess(user, id, { allowArchived: true });
  if (!access) {
    res.status(404).json({ message: "Mesa não encontrada" });
    return;
  }

  // DETALHES
  if (req.method === "GET") {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        master: { select: { id: true, username: true } },
        members: {
          include: { user: { select: { id: true, username: true, role: true } } },
        },
        invites: { where: { active: true } },
        _count: { select: { characters: true, combats: true } },
      },
    });
    res.status(200).json(campaign);
    return;
  }

  // EDITAR / ARQUIVAR (apenas mestre dono)
  if (req.method === "PATCH") {
    if (!access.isMaster) {
      res.status(403).json({ message: "Apenas o mestre da mesa pode editar" });
      return;
    }

    const { name, description, image, archived, defenseFormula, maxLifeFormula, reactionsPerRound, characterImageColor } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof description === "string") data.description = description;
    if (typeof image === "string") data.image = image;
    if (archived === true) data.archivedAt = new Date();
    if (archived === false) data.archivedAt = null;

    // Fórmulas de atributos derivados: string vazia/null volta pra fórmula padrão
    for (const [field, value] of [
      ["defenseFormula", defenseFormula],
      ["maxLifeFormula", maxLifeFormula],
    ] as const) {
      if (value === undefined) continue;
      if (value === null || (typeof value === "string" && !value.trim())) {
        data[field] = null;
        continue;
      }
      if (typeof value !== "string") {
        res.status(400).json({ message: `${field} deve ser uma string` });
        return;
      }
      const error = validateFormula(value);
      if (error) {
        res.status(400).json({ message: `Fórmula inválida (${field === "defenseFormula" ? "defesa" : "vida máxima"}): ${error}` });
        return;
      }
      data[field] = value.trim();
    }

    // Limite de reações por rodada (ataques extras são por personagem, na ficha)
    if (reactionsPerRound !== undefined) {
      if (reactionsPerRound === null || reactionsPerRound === "") {
        data.reactionsPerRound = null; // ilimitado
      } else {
        const n = Number(reactionsPerRound);
        if (!Number.isInteger(n) || n < 0 || n > 20) {
          res.status(400).json({ message: "reactionsPerRound deve ser um inteiro entre 0 e 20 (ou vazio para ilimitado)" });
          return;
        }
        data.reactionsPerRound = n;
      }
    }

    // Cor de destaque da imagem do personagem (hex); vazio/null volta pro padrão
    if (characterImageColor !== undefined) {
      if (characterImageColor === null || characterImageColor === "") {
        data.characterImageColor = null;
      } else if (
        typeof characterImageColor === "string" &&
        /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(characterImageColor.trim())
      ) {
        data.characterImageColor = characterImageColor.trim();
      } else {
        res.status(400).json({ message: "characterImageColor deve ser uma cor hex (ex: #FF3D00)" });
        return;
      }
    }

    const campaign = await prisma.campaign.update({ where: { id }, data });
    res.status(200).json(campaign);
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
