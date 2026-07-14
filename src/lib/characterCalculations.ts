import { evaluateFormula, AttributeValues } from "./formula";

// Fórmulas padrão do sistema — usadas quando a mesa não configura as suas.
export const DEFAULT_MAX_LIFE_FORMULA = "25 + forca*2 + vigor*3";
export const DEFAULT_DEFENSE_FORMULA = "3 + agilidade + vigor";

/**
 * Calcula a vida máxima usando a fórmula da campanha (ou a padrão).
 * Se a fórmula configurada for inválida, cai na padrão.
 */
export function calculateMaxLife(
  attrs: AttributeValues,
  formula?: string | null
): number {
  return safeEvaluate(formula, DEFAULT_MAX_LIFE_FORMULA, attrs);
}

/**
 * Calcula a defesa base usando a fórmula da campanha (ou a padrão).
 * Se a fórmula configurada for inválida, cai na padrão.
 */
export function calculateDefense(
  attrs: AttributeValues,
  formula?: string | null
): number {
  return safeEvaluate(formula, DEFAULT_DEFENSE_FORMULA, attrs);
}

function safeEvaluate(
  formula: string | null | undefined,
  fallback: string,
  attrs: AttributeValues
): number {
  if (formula && formula.trim()) {
    try {
      return evaluateFormula(formula, attrs);
    } catch {
      // fórmula corrompida no banco — usa a padrão em vez de quebrar a tela
    }
  }
  return evaluateFormula(fallback, attrs);
}

export function calculateCounterAttackDamage(
  baseDamage: number,
  strength: number,
  modifier: number = 0
): number {
  return baseDamage + strength + modifier;
}
