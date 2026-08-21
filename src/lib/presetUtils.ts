import { ActionType, TargetType } from "@prisma/client";
import { resolveAttributeAlias } from "./formula";

const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Mesma checagem de src/lib/attributes.ts::formulaReferencesAttribute, só que sem depender do prisma (seguro pro bundle do client). */
export function formulaReferencesAttribute(formula: string | null | undefined, attribute: string): boolean {
  if (!formula || !attribute) return false;
  const target = resolveAttributeAlias(attribute);
  for (const match of formula.matchAll(VARIABLE_PATTERN)) {
    if (resolveAttributeAlias(match[1]) === target) return true;
  }
  return false;
}

const FIXED_ATTRIBUTE_KEYS = ["strength", "agility", "vigor", "intellect", "presence"];

/** Mapa { chave canônica -> valor } com os 5 atributos fixos + customizados de um personagem, pra resolver {{atributo}} na exibição. */
export function buildAttributeValueMap(character: {
  strength?: number;
  agility?: number;
  vigor?: number;
  intellect?: number;
  presence?: number;
  customAttributes?: Record<string, number> | null;
} | null | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  for (const key of FIXED_ATTRIBUTE_KEYS) {
    map[key] = (character as Record<string, unknown>)?.[key] as number ?? 0;
  }
  for (const [key, value] of Object.entries(character?.customAttributes ?? {})) {
    map[key] = Number(value) || 0;
  }
  return map;
}

/**
 * Substitui {{atributo}} pelo valor resolvido (ex: "{{força}}d20" ->
 * "8d20") — usado em exibições fora da edição (card de habilidade, tooltip,
 * logs), onde o texto da variável não ajuda ninguém a ler a ficha. Sem mapa
 * de valores ou sem variável na fórmula, devolve a fórmula como está.
 */
export function previewFormulaVariables(
  formula: string | null | undefined,
  attributeValues?: Record<string, number>
): string {
  if (!formula) return "";
  if (!attributeValues || !formula.includes("{{")) return formula;
  return formula.replace(VARIABLE_PATTERN, (_m, word: string) =>
    String(attributeValues[resolveAttributeAlias(word)] ?? 0)
  );
}

export const ACTION_COLORS: Record<ActionType, string> = {
  ATTACK: "#FF6B6B",      // Vermelho
  REACT: "#4ECDC4",       // Azul/Turquesa
  SKILL: "#A78BFA",       // Roxo
  SUPPORT: "#34D399",     // Verde
  TEST: "#9CA3AF",        // Cinza
  SPELL: "#FBBF24",       // Amarelo
  HEAL: "#10B981",        // Verde escuro
  BUFF: "#60A5FA",        // Azul claro
  DEBUFF: "#F87171",      // Vermelho claro
  TRANSFORM: "#A78BFA",   // Roxo (mesma família do SKILL — ação de forma)
};

export const ACTION_ICONS: Record<ActionType, string> = {
  ATTACK: "⚔️",
  REACT: "🛡️",
  SKILL: "✨",
  SUPPORT: "🤝",
  TEST: "📊",
  SPELL: "🔮",
  HEAL: "💚",
  BUFF: "⬆️",
  DEBUFF: "⬇️",
  TRANSFORM: "🜂",
};

export const TARGET_NAMES: Record<TargetType, string> = {
  SELF: "Em si mesmo",
  ALLY: "Aliado",
  ENEMY: "Inimigo",
  MULTIPLE: "Múltiplos",
};

export const ACTION_NAMES: Record<ActionType, string> = {
  ATTACK: "Ataque",
  REACT: "Reação",
  SKILL: "Habilidade",
  SUPPORT: "Suporte",
  TEST: "Teste",
  SPELL: "Magia",
  HEAL: "Cura",
  BUFF: "Bonus",
  DEBUFF: "Penalidade",
  TRANSFORM: "Transformação",
};

export function getActionColor(type: ActionType): string {
  return ACTION_COLORS[type] || "#9CA3AF";
}

export function getActionIcon(type: ActionType): string {
  return ACTION_ICONS[type] || "⚡";
}

export function getActionName(type: ActionType): string {
  return ACTION_NAMES[type] || type;
}

export function getTargetName(type: TargetType): string {
  return TARGET_NAMES[type] || type;
}

/**
 * Calcula o dano estimado de um preset
 */
export function calculateDamageEstimate(
  impactFormula: string | null | undefined,
  modifier: number = 0,
  characterAttribute: number = 0
) {
  if (!impactFormula) return null;

  // Parse simples para formulas como "2d6", "1d20", etc
  const diceMatch = impactFormula.match(/(\d+)d(\d+)/);
  if (!diceMatch) return null;

  const numberOfDice = parseInt(diceMatch[1]);
  const diceSize = parseInt(diceMatch[2]);

  const minDamage = numberOfDice + modifier + characterAttribute;
  const maxDamage = numberOfDice * diceSize + modifier + characterAttribute;
  const avgDamage = Math.round((numberOfDice * (diceSize + 1)) / 2 + modifier + characterAttribute);

  return {
    min: Math.max(0, minDamage),
    avg: Math.max(0, avgDamage),
    max: maxDamage,
  };
}

/**
 * Calcula dano crítico
 */
export function calculateCriticalDamage(
  normalDamage: { min: number; avg: number; max: number },
  critMultiplier: number = 2
) {
  return {
    min: Math.round(normalDamage.min * critMultiplier),
    avg: Math.round(normalDamage.avg * critMultiplier),
    max: Math.round(normalDamage.max * critMultiplier),
  };
}

/**
 * Formata a exibição de um preset
 */
export function formatPresetDisplay(
  diceFormula: string,
  impactFormula: string | null | undefined,
  modifier: number = 0,
  characterAttribute: number = 0,
  attributeName: string = "",
  attributeValues?: Record<string, number>
): string {
  let display = previewFormulaVariables(diceFormula, attributeValues);

  // Se a fórmula já usa {{atributo}}, o bônus já está embutido no dado —
  // não repete no texto (evita o "{{força}}d20 + 8 (STRENGTH)" enganoso)
  if (characterAttribute > 0 && !formulaReferencesAttribute(diceFormula, attributeName)) {
    display += ` + ${characterAttribute} (${attributeName})`;
  }

  if (modifier > 0) {
    display += ` + ${modifier}`;
  } else if (modifier < 0) {
    display += ` ${modifier}`;
  }

  if (impactFormula) {
    display += ` → ${previewFormulaVariables(impactFormula, attributeValues)}`;
  }

  return display;
}
