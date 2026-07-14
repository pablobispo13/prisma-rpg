import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { RollResult } from "@prisma/client";
import { getCampaignAccess } from "../../../lib/campaignAccess";

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
        select: { campaignId: true },
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

    if (req.method === "GET") {
        const combat = await prisma.combat.findUnique({
            where: { id },
            include: {
                participants: {
                    include: {
                        character: {
                            include: {
                                presets: true,
                                statusEffects: true,
                                owner: { select: { role: true } },
                                // Para o botão de transformação na tela de combate
                                forms: { select: { id: true, name: true, image: true } },
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

        const rollResultsWithTargets = combat.rollResults.map((roll: RollResult) => {
            const targets = roll.targetIds.map((tid: string) => {
                return combat.participants.find((p: any) => p.character.id === tid)?.character || null;/* eslint-disable  @typescript-eslint/no-explicit-any */
            });
            return { ...roll, targets };
        });

        res.status(200).json({ ...combat, rollResults: rollResultsWithTargets });
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
