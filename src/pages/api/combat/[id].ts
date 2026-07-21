import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { getCampaignAccess, hideCharacterSanity } from "../../../lib/campaignAccess";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    const { id } = req.query;
    const user = req.user!;

    if (!id || typeof id !== "string") {
        res.status(400).json({ message: "id inválido" });
        return;
    }

    // Valida que o usuário tem acesso à mesa dona deste combate
    const owning = await prisma.combat.findUnique({
        where: { id },
        select: { campaignId: true, campaign: { select: { worldDay: true } } },
    });
    if (!owning) {
        res.status(404).json({ message: "Combate não encontrado" });
        return;
    }
    const access = await getCampaignAccess(user, owning.campaignId);
    if (!access) {
        res.status(403).json({ message: "Sem acesso a esta mesa" });
        return;
    }
    const worldDay = owning.campaign.worldDay ?? 1;

    if (req.method === "GET") {
        const combat = await prisma.combat.findUnique({
            where: { id },
            include: {
                participants: {
                    include: {
                        character: {
                            include: {
                                // Uso diário (worldDay atual) por habilidade, pro indicador
                                // visual de "X/Y usos hoje" no botão da ação em combate
                                presets: { include: { dailyUsages: { where: { worldDay } } } },
                                statusEffects: true,
                                owner: { select: { role: true } },
                                // Para o botão de transformação na tela de combate
                                forms: { select: { id: true, name: true, image: true } },
                                // Limite e uso diário de transformações ficam na ficha principal
                                primaryForm: {
                                    select: {
                                        maxTransformationsPerDay: true,
                                        transformationDailyUsages: { where: { worldDay }, select: { usedCount: true } },
                                    },
                                },
                                transformationDailyUsages: { where: { worldDay }, select: { usedCount: true } },
                            },
                        },
                    },
                },
                turns: true,
                logs: { include: { roll: { select: { id: true, diceRolled: true, rolls: true, modifier: true, total: true, impactRolls: true, success: true, critical: true, damage: true, healing: true, pendingReaction: true, reacted: true } }, character: true, target: true } },
                rollResults: {
                    include: { character: true },
                },
            },
        });

        if (!combat) {
            res.status(404).json({ message: "Combate não encontrado" });
            return;
        }

        const rollResultsWithTargets = combat.rollResults.map((roll) => {
            const targets = roll.targetIds.map((tid: string) => {
                const found = combat.participants.find((p) => p.character.id === tid)?.character || null;
                return found ? hideCharacterSanity(found, access.isMaster) : null;
            });
            return { ...roll, targets, character: hideCharacterSanity(roll.character, access.isMaster) };
        });

        // Logs marcados como masterOnly (ex: ajuste manual de HP) não vão para jogadores
        const visibleLogs = access.isMaster
            ? combat.logs
            : combat.logs.filter((l) => l.masterOnly !== true);

        // Sanidade é exclusiva do mestre: some das fichas dos participantes
        // (e do character embutido em cada log) para jogadores
        const visibleParticipants = combat.participants.map((p) => ({
            ...p,
            character: hideCharacterSanity(p.character, access.isMaster),
        }));
        const visibleLogsClean = visibleLogs.map((l) => ({
            ...l,
            character: l.character ? hideCharacterSanity(l.character, access.isMaster) : l.character,
            target: l.target ? hideCharacterSanity(l.target, access.isMaster) : l.target,
        }));

        res.status(200).json({
            ...combat,
            participants: visibleParticipants,
            logs: visibleLogsClean,
            rollResults: rollResultsWithTargets,
        });
        return;
    }

    if (req.method === "DELETE") {
        if (!access.isMaster) {
            res.status(403).json({ message: "Apenas o mestre pode deletar combates" });
            return;
        }

        const combat = await prisma.combat.findUnique({ where: { id } });
        if (!combat) {
            res.status(404).json({ message: "Combate não encontrado" });
            return;
        }

        await prisma.$transaction(async (tx) => {
            const rolls = await tx.rollResult.findMany({
                where: { combatId: id },
                select: { id: true },
            });
            const rollIds = rolls.map((r) => r.id);

            if (rollIds.length > 0) {
                await tx.rollResultDetail.deleteMany({
                    where: { rollResultId: { in: rollIds } },
                });
            }
            await tx.actionLog.deleteMany({ where: { combatId: id } });
            await tx.rollResult.deleteMany({ where: { combatId: id } });
            await tx.combatTurn.deleteMany({ where: { combatId: id } });
            await tx.combatParticipant.deleteMany({ where: { combatId: id } });
            await tx.combat.delete({ where: { id } });
        });

        res.status(200).json({ message: "Combate deletado com sucesso" });
        return;
    }

    res.status(405).end();
}

export default authenticate(handler);
