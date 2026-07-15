import { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { canActOnCharacter } from "../../../../lib/campaignAccess";
import { LogType } from "@prisma/client";
import { notifyCombatUpdate } from "../../../../lib/pusher";

/**
 * POST /api/characters/[id]/switch-form — troca a ficha ativa do personagem.
 * [id] é o personagem PRINCIPAL; body: { formId } (o próprio id principal volta à base).
 * Dono do personagem ou mestre. Em combate ativo, o participante passa a usar a
 * nova ficha: o HP atual é salvo na ficha que saiu e o da nova ficha assume.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query;
  const user = req.user!;

  if (typeof id !== "string") {
    res.status(400).json({ message: "ID inválido" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const { formId } = req.body ?? {};
  if (typeof formId !== "string" || !formId) {
    res.status(400).json({ message: "formId obrigatório" });
    return;
  }

  const primary = await prisma.character.findUnique({
    where: { id },
    include: { forms: { select: { id: true, name: true, life: true, maxLife: true } } },
  });
  if (!primary) {
    res.status(404).json({ message: "Personagem não encontrado" });
    return;
  }
  if (primary.primaryFormId) {
    res.status(400).json({ message: "Use o id do personagem principal para trocar de forma" });
    return;
  }
  if (!(await canActOnCharacter(user, primary.id))) {
    res.status(403).json({ message: "Acesso negado" });
    return;
  }

  const isRevertToBase = formId === primary.id;
  const targetForm = isRevertToBase ? null : primary.forms.find((f) => f.id === formId);
  if (!isRevertToBase && !targetForm) {
    res.status(400).json({ message: "Esta forma não pertence a este personagem" });
    return;
  }

  const currentActiveId = primary.activeFormId ?? primary.id;
  const newActiveId = isRevertToBase ? primary.id : formId;
  if (currentActiveId === newActiveId) {
    res.status(200).json({ activeFormId: primary.activeFormId, changed: false });
    return;
  }

  const newActive = await prisma.character.findUnique({
    where: { id: newActiveId },
    select: { id: true, name: true, life: true, maxLife: true },
  });
  const currentActive = await prisma.character.findUnique({
    where: { id: currentActiveId },
    select: { id: true, name: true },
  });
  if (!newActive || !currentActive) {
    res.status(404).json({ message: "Forma não encontrada" });
    return;
  }

  // Participações em combates ativos usando a ficha atual
  const activeParticipants = await prisma.combatParticipant.findMany({
    where: { characterId: currentActiveId, combat: { active: true } },
    include: { combat: { select: { id: true } } },
  });

  // Não permite transformar com reação pendente desta ficha (travaria a fila)
  if (activeParticipants.length > 0) {
    const combatIds = activeParticipants.map((p) => p.combatId);
    const openRolls = await prisma.rollResult.findMany({
      where: { combatId: { in: combatIds }, pendingReaction: true, reacted: false },
      select: { pendingReactionTargets: true },
    });
    const hasPendingReaction = openRolls.some((r) =>
      (r.pendingReactionTargets as Array<{ targetId?: string; status?: string }>).some(
        (rt) => rt?.targetId === currentActiveId && rt?.status === "PENDING"
      )
    );
    if (hasPendingReaction) {
      res.status(400).json({ message: "Resolva a reação pendente antes de trocar de forma" });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.character.update({
      where: { id: primary.id },
      data: { activeFormId: isRevertToBase ? null : newActiveId },
    });

    // Transformar limpa os efeitos ativos (veneno, buffs, DoT/HoT):
    // a nova forma começa sem efeitos, e a ficha que saiu não guarda resíduos
    await tx.characterEffect.deleteMany({
      where: { characterId: { in: [currentActiveId, newActiveId] } },
    });

    for (const participant of activeParticipants) {
      // Preserva o HP da ficha que está saindo do combate
      await tx.character.update({
        where: { id: currentActiveId },
        data: { life: participant.currentLife },
      });

      await tx.combatParticipant.update({
        where: { id: participant.id },
        data: {
          characterId: newActiveId,
          currentLife: Math.min(newActive.life, newActive.maxLife),
        },
      });

      // Turno em aberto da ficha antiga passa a apontar pra nova.
      // Mongo: turno aberto pode ter endedAt null OU ausente no documento
      await tx.combatTurn.updateMany({
        where: {
          combatId: participant.combatId,
          characterId: currentActiveId,
          OR: [{ endedAt: null }, { endedAt: { isSet: false } }],
        },
        data: { characterId: newActiveId },
      });

      await tx.actionLog.create({
        data: {
          type: LogType.MANUAL_OVERRIDE,
          message: `${currentActive.name} se transformou em ${newActive.name}`,
          characterId: newActiveId,
          combatId: participant.combatId,
        },
      });
    }

    // Fora de combate também fica registrado no histórico do personagem
    if (activeParticipants.length === 0) {
      await tx.actionLog.create({
        data: {
          type: LogType.MANUAL_OVERRIDE,
          message: `${currentActive.name} se transformou em ${newActive.name}`,
          characterId: newActiveId,
        },
      });
    }
  });

  for (const participant of activeParticipants) {
    notifyCombatUpdate(participant.combatId); // fire-and-forget
  }

  res.status(200).json({
    activeFormId: isRevertToBase ? null : newActiveId,
    activeCharacterId: newActiveId,
    changed: true,
  });
  return;
}

export default authenticate(handler);
