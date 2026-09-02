import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { canActOnCharacter } from "../../../lib/campaignAccess";


async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    const user = req.user!;

    // LISTAR ACTIONLOGS
    if (req.method === "GET") {
        const { characterId } = req.query;

        if (typeof characterId !== "string") {
            res.status(400).json({ message: "characterId é obrigatório" });
            return;
        }

        if (!(await canActOnCharacter(user, characterId))) {
            res.status(403).json({ message: "Sem acesso a este personagem" });
            return;
        }

        // Ajustes manuais do mestre (masterOnly) só aparecem para o próprio mestre
        const charForLogs = await prisma.character.findUnique({
            where: { id: characterId },
            select: { campaign: { select: { masterId: true } } },
        });
        const isMasterOfChar = charForLogs?.campaign.masterId === user.userId;

        // Busca uma folga extra e filtra masterOnly em JS (não no Mongo): logs
        // antigos/a maioria não têm o campo `masterOnly` gravado no documento
        // (undefined, não `null`), e o filtro `NOT: { masterOnly: true }` do
        // Prisma no conector Mongo não casa com campo ausente — some literalmente
        // todos os logs "normais" da lista de um jogador. Ver combat/[id].ts e
        // combat/history.ts, que já filtram assim no JS por este mesmo motivo.
        const rawLogs = await prisma.actionLog.findMany({
            where: { characterId },
            take: isMasterOfChar ? 10 : 30,
            orderBy: { createdAt: "desc" },
            include: {
                roll: { include: { preset: true } },
                character: true, target: true
            }
        });

        const actionLogs = isMasterOfChar
            ? rawLogs
            : rawLogs.filter((l) => l.masterOnly !== true).slice(0, 10);

        res.status(200).json({ actionLogs });
        return;
    }

    if (req.method !== "POST") {
        res.status(405).end();
        return;
    }

    res.status(405).end();
}

export default authenticate(handler);
