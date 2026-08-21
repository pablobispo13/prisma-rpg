import { RESERVED_ATTRIBUTE_KEYS } from "./formula";
import { FIXED_ATTRIBUTES } from "./attributes";

/**
 * Converte o label digitado pelo mestre (ex: "Maestria", "Sorte!") numa key
 * estável (ex: "maestria"). Restrita a letras minúsculas sem acento — mesmo
 * alfabeto aceito pelo tokenizer de fórmulas (src/lib/formula.ts), já que a
 * key também funciona como nome de variável em defenseFormula/maxLifeFormula.
 */
export function slugifyAttributeKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Keys que um CustomAttribute não pode usar: colidem com atributo fixo ou alias de fórmula. */
export function isReservedAttributeKey(key: string): boolean {
  return (
    RESERVED_ATTRIBUTE_KEYS.includes(key) ||
    (FIXED_ATTRIBUTES as readonly string[]).includes(key.toUpperCase())
  );
}

/**
 * Normaliza os valores de atributos customizados recebidos do cliente
 * (ex: { maestria: "3" }), mantendo só keys válidas (presentes em validKeys)
 * e coagindo para inteiro. Usado ao criar/editar personagem.
 */
export function sanitizeCustomAttributeValues(
  raw: unknown,
  validKeys: Set<string>
): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!validKeys.has(key)) continue;
    const n = Number(value);
    if (Number.isFinite(n)) result[key] = Math.trunc(n);
  }
  return result;
}

/** Seed do preset "Teste <Label>" gerado automaticamente para um atributo (fixo ou customizado). */
export function attributeTestPresetSeed(attribute: string, label: string) {
  return {
    name: `Teste ${label}`,
    description: `Teste de ${label}`,
    type: "TEST" as const,
    targetType: "SELF" as const,
    diceFormula: "1d20",
    modifier: 0,
    critThreshold: 20,
    critMultiplier: null,
    requiresTurn: false,
    allowOutOfCombat: true,
    appliesEffect: false,
    attribute,
  };
}
