import { FIXED_ATTRIBUTES, isFixedAttribute } from "./attributes";
import { slugifyAttributeKey } from "./customAttributes";

/**
 * Perícias: testes fora de combate atrelados a um dos 5 atributos fixos.
 * Definidas por mesa (model Skill); o bônus de cada personagem fica em
 * Character.skills ({ [key]: bônus }, chave ausente = 0).
 *
 * Rolagem: 1d20 + atributo base + bônus da perícia (ver POST /roll com skillKey).
 */

export const SKILL_DICE_FORMULA = "1d20";

export const BASE_ATTRIBUTE_LABEL: Record<string, string> = {
  STRENGTH: "Força",
  AGILITY: "Agilidade",
  VIGOR: "Vigor",
  INTELLECT: "Intelecto",
  PRESENCE: "Presença",
};

/** Perícias sugeridas — criadas pelo botão "Adicionar perícias padrão" da mesa. */
export const DEFAULT_SKILLS: { label: string; baseAttribute: (typeof FIXED_ATTRIBUTES)[number] }[] = [
  { label: "Atletismo", baseAttribute: "STRENGTH" },
  { label: "Luta", baseAttribute: "STRENGTH" },
  { label: "Acrobacia", baseAttribute: "AGILITY" },
  { label: "Furtividade", baseAttribute: "AGILITY" },
  { label: "Pontaria", baseAttribute: "AGILITY" },
  { label: "Reflexos", baseAttribute: "AGILITY" },
  { label: "Fortitude", baseAttribute: "VIGOR" },
  { label: "Investigação", baseAttribute: "INTELLECT" },
  { label: "Medicina", baseAttribute: "INTELLECT" },
  { label: "Ocultismo", baseAttribute: "INTELLECT" },
  { label: "Tecnologia", baseAttribute: "INTELLECT" },
  { label: "Percepção", baseAttribute: "PRESENCE" },
  { label: "Intuição", baseAttribute: "PRESENCE" },
  { label: "Diplomacia", baseAttribute: "PRESENCE" },
  { label: "Enganação", baseAttribute: "PRESENCE" },
  { label: "Intimidação", baseAttribute: "PRESENCE" },
];

/** Key estável da perícia (mesmo slug dos atributos customizados). */
export const slugifySkillKey = slugifyAttributeKey;

/** Normaliza o atributo base recebido do cliente ("agility" → "AGILITY"); null se inválido. */
export function normalizeBaseAttribute(value: unknown): string | null {
  if (typeof value !== "string" || !isFixedAttribute(value)) return null;
  return value.toUpperCase();
}

/** Lê o bônus de uma perícia num personagem (chave ausente = 0). */
export function getSkillBonus(character: { skills?: unknown }, key: string): number {
  const skills = character.skills as Record<string, number> | null | undefined;
  return Number(skills?.[key] ?? 0);
}
