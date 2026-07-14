/**
 * Backfill dos campos de limites por rodada (jul/2026).
 *
 * MongoDB não tem migrations: documentos criados antes do schema novo não têm
 * os campos requeridos `Campaign.attacksPerRound`, `CombatParticipant.attacksUsed`
 * e `CombatParticipant.reactionsUsed`, e o Prisma falha ao ler campo requerido
 * ausente. Este script preenche apenas onde o campo não existe (idempotente).
 *
 * Uso: npx tsx scripts/backfill-round-limits.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.$runCommandRaw({
    update: "Campaign",
    updates: [
      {
        q: { attacksPerRound: { $exists: false } },
        u: { $set: { attacksPerRound: 1 } },
        multi: true,
      },
    ],
  });
  console.log("Campaign.attacksPerRound:", JSON.stringify(campaigns));

  const participants = await prisma.$runCommandRaw({
    update: "CombatParticipant",
    updates: [
      {
        q: { attacksUsed: { $exists: false } },
        u: { $set: { attacksUsed: 0 } },
        multi: true,
      },
      {
        q: { reactionsUsed: { $exists: false } },
        u: { $set: { reactionsUsed: 0 } },
        multi: true,
      },
    ],
  });
  console.log("CombatParticipant.attacksUsed/reactionsUsed:", JSON.stringify(participants));

  // Campos de formas alternativas: no Mongo/Prisma, campo ausente NÃO casa com
  // filtro null — grava null explícito nos personagens antigos
  const characters = await prisma.$runCommandRaw({
    update: "Character",
    updates: [
      {
        q: { primaryFormId: { $exists: false } },
        u: { $set: { primaryFormId: null } },
        multi: true,
      },
      {
        q: { activeFormId: { $exists: false } },
        u: { $set: { activeFormId: null } },
        multi: true,
      },
    ],
  });
  console.log("Character.primaryFormId/activeFormId:", JSON.stringify(characters));

  // Turnos abertos criados sem o campo endedAt (Prisma/Mongo omite opcionais
  // não definidos no create) — grava null explícito
  const turns = await prisma.$runCommandRaw({
    update: "CombatTurn",
    updates: [
      {
        q: { endedAt: { $exists: false } },
        u: { $set: { endedAt: null } },
        multi: true,
      },
    ],
  });
  console.log("CombatTurn.endedAt:", JSON.stringify(turns));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
