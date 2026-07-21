import { ActionType, TargetType } from "@prisma/client";

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
  attributeName: string = ""
): string {
  let display = diceFormula;

  if (characterAttribute > 0) {
    display += ` + ${characterAttribute} (${attributeName})`;
  }

  if (modifier > 0) {
    display += ` + ${modifier}`;
  } else if (modifier < 0) {
    display += ` ${modifier}`;
  }

  if (impactFormula) {
    display += ` → ${impactFormula}`;
  }

  return display;
}
