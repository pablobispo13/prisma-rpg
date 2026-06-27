import { prisma } from "./prisma";
import type { AuthUser } from "./auth";

export type CampaignAccess = {
  campaignId: string;
  isMaster: boolean;
  isMember: boolean;
};

/**
 * Verifica se o usuário tem acesso à campanha (como mestre dono ou como membro).
 * Retorna null se não tiver acesso.
 */
export async function getCampaignAccess(
  user: AuthUser,
  campaignId: string,
  opts?: { allowArchived?: boolean }
): Promise<CampaignAccess | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, masterId: true, archivedAt: true },
  });

  if (!campaign) return null;
  if (campaign.archivedAt && !opts?.allowArchived) return null;

  const isMaster = campaign.masterId === user.userId;
  let isMember = isMaster;

  if (!isMaster) {
    // Admin é membro de qualquer mesa (mas não mestre, exceto se for o masterId)
    if (user.isAdmin) {
      isMember = true;
    } else {
      const member = await prisma.campaignMember.findUnique({
        where: {
          campaignId_userId: { campaignId, userId: user.userId },
        },
        select: { id: true },
      });
      isMember = !!member;
    }
  }

  if (!isMaster && !isMember) return null;

  return { campaignId, isMaster, isMember };
}

/**
 * Verifica se o usuário pode operar sobre um personagem específico.
 * Regra: é dono do personagem OU é o mestre dono da mesa do personagem.
 */
export async function canActOnCharacter(
  user: AuthUser,
  characterId: string
): Promise<boolean> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      ownerId: true,
      campaign: { select: { masterId: true, archivedAt: true } },
    },
  });
  if (!character) return false;
  if (character.campaign.archivedAt) return false;
  if (character.ownerId === user.userId) return true;
  if (character.campaign.masterId === user.userId) return true;
  return false;
}

/**
 * Retorna a campaignId de um personagem, ou null se não existir.
 */
export async function getCharacterCampaign(characterId: string): Promise<string | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  return character?.campaignId ?? null;
}

/**
 * Gera um código de convite de 6 caracteres alfanuméricos.
 */
export function generateInviteCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
