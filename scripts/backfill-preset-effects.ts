/**
 * Migra presets legados de efeito único para o modelo multi-efeito (PresetEffect).
 *
 * Para cada ActionPreset com appliesEffect e configuração de efeito legada
 * (effectType/durationTurns/effectAmount) que ainda não possui linhas em
 * PresetEffect, cria uma linha equivalente. Os campos legados são mantidos
 * (roll.ts usa PresetEffect quando existe; senão cai no fallback legado),
 * então rodar este script é idempotente e seguro.
 *
 * Uso: npx tsx scripts/backfill-preset-effects.ts
 */
import { PrismaClient, EffectType, ActionType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const presets = await prisma.actionPreset.findMany({
    include: { effects: { select: { id: true } } },
  });

  let created = 0;
  let skipped = 0;

  for (const preset of presets) {
    if (preset.effects.length > 0) {
      skipped++;
      continue;
    }
    if (!preset.appliesEffect) {
      skipped++;
      continue;
    }

    // Mesma regra do roll.ts legado: TEMP_HP aplica na hora via effectAmount;
    // os demais tipos só viram efeito se houver duração
    const effectType: EffectType =
      preset.effectType ??
      (preset.type === ActionType.ATTACK
        ? EffectType.DAMAGE_OVER_TIME
        : EffectType.HEAL_OVER_TIME);

    const isTempHp = effectType === EffectType.TEMP_HP;
    const hasDuration = (preset.durationTurns ?? 0) > 0;

    if (!isTempHp && !hasDuration) {
      skipped++;
      continue;
    }

    await prisma.presetEffect.create({
      data: {
        presetId: preset.id,
        name: preset.name,
        effectType,
        target: "TARGETS",
        value: preset.effectAmount ?? null,
        statAffected: preset.statAffected ?? null,
        statusApplied: preset.statusApplied ?? null,
        durationTurns: preset.durationTurns ?? null,
        sortOrder: 0,
      },
    });
    created++;
  }

  console.log(`PresetEffects criados: ${created} | presets sem efeito ou já migrados: ${skipped}`);
}

main()
  .catch((err) => {
    console.error("Erro na migração:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
