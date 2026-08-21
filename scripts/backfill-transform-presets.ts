/**
 * Cria os ActionPreset type=TRANSFORM que faltam nos personagens que já
 * tinham formas alternativas ANTES desta feature existir (POST .../forms
 * só passou a gerar esses presets automaticamente depois).
 *
 * Para cada personagem principal (sem primaryFormId) com forms.length > 0:
 *   - garante 1 preset "Voltar à forma base" (targetFormId: null)
 *   - garante 1 preset "Virar <nome da forma>" por forma (targetFormId: form.id)
 *
 * Idempotente: pula o que já existe (checa por targetFormId), então pode
 * ser rodado quantas vezes for preciso sem duplicar.
 *
 * Uso: npx tsx scripts/backfill-transform-presets.ts
 */
import { PrismaClient, ActionType, TargetType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const allCharacters = await prisma.character.findMany({
    include: {
      forms: { select: { id: true, name: true } },
      presets: { where: { type: ActionType.TRANSFORM }, select: { targetFormId: true } },
    },
  });

  const primaries = allCharacters.filter((c) => !c.primaryFormId && c.forms.length > 0);

  let createdRevert = 0;
  let createdForm = 0;
  let skipped = 0;

  for (const primary of primaries) {
    const existingTargetIds = new Set(
      primary.presets.map((p) => p.targetFormId ?? "BASE")
    );

    if (!existingTargetIds.has("BASE")) {
      await prisma.actionPreset.create({
        data: {
          name: "Voltar à forma base",
          description: `Retorna à ficha original (${primary.name}). Não consome o limite diário de transformações.`,
          type: ActionType.TRANSFORM,
          targetType: TargetType.SELF,
          diceFormula: "0",
          attribute: "STRENGTH",
          requiresTurn: false,
          allowOutOfCombat: true,
          appliesEffect: false,
          characterId: primary.id,
          targetFormId: null,
        },
      });
      createdRevert++;
    } else {
      skipped++;
    }

    for (const form of primary.forms) {
      if (existingTargetIds.has(form.id)) {
        skipped++;
        continue;
      }
      await prisma.actionPreset.create({
        data: {
          name: `Virar ${form.name}`,
          description: `Assume a forma "${form.name}".`,
          type: ActionType.TRANSFORM,
          targetType: TargetType.SELF,
          diceFormula: "0",
          attribute: "STRENGTH",
          requiresTurn: false,
          allowOutOfCombat: true,
          appliesEffect: false,
          characterId: primary.id,
          targetFormId: form.id,
        },
      });
      createdForm++;
    }
  }

  console.log(
    `Personagens principais com formas: ${primaries.length} | ` +
      `presets "voltar à base" criados: ${createdRevert} | ` +
      `presets "virar forma" criados: ${createdForm} | ` +
      `já existentes (pulados): ${skipped}`
  );
}

main()
  .catch((err) => {
    console.error("Erro no backfill:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
