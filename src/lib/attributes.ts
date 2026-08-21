import { prisma } from "./prisma";
import { resolveAttributeAlias } from "./formula";

/**
 * Atributos: os 5 fixos (colunas escalares de Character) mais os
 * customizados por mesa (CustomAttribute, guardados em
 * Character.customAttributes como { [key]: valor }). Em qualquer lugar do
 * sistema (rolagens, fórmulas, presets, buffs/debuffs) um "atributo" é só
 * uma string: um dos 5 nomes fixos em maiúsculo (ex: "STRENGTH") ou a `key`
 * (slug minúsculo) de um CustomAttribute da mesa.
 */

export const FIXED_ATTRIBUTES = ["STRENGTH", "AGILITY", "VIGOR", "INTELLECT", "PRESENCE"] as const;
export type FixedAttribute = (typeof FIXED_ATTRIBUTES)[number];

export function isFixedAttribute(attribute: string): boolean {
    return (FIXED_ATTRIBUTES as readonly string[]).includes(attribute.toUpperCase());
}

/** Lê o valor de um atributo (fixo ou customizado) num personagem. */
export function getAttributeValue(
    character: Record<string, unknown>,
    attribute: string
): number {
    if (isFixedAttribute(attribute)) {
        return Number(character[attribute.toLowerCase()] ?? 0);
    }
    const custom = character.customAttributes as Record<string, number> | null | undefined;
    return Number(custom?.[attribute.toLowerCase()] ?? 0);
}

const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Substitui toda ocorrência de "{{atributo}}" numa fórmula de dado (ex:
 * "{{força}}d20", "1d20+{{maestria}}") pelo valor atual do atributo no
 * personagem — aceita os mesmos aliases PT/EN das fórmulas de vida/defesa
 * (força, for, strength, str…) e qualquer key de atributo customizado da
 * mesa. Atributo desconhecido vira 0 (mesma convenção de getAttributeValue),
 * não quebra a rolagem. Resultado pronto para rollDice()/validateDiceFormula().
 */
export function substituteAttributeVariables(formula: string, character: Record<string, unknown>): string {
    return formula.replace(VARIABLE_PATTERN, (_match, word: string) => {
        const attr = resolveAttributeAlias(word);
        return String(getAttributeValue(character, attr));
    });
}

/**
 * Diz se a fórmula já referencia um atributo específico via "{{...}}" (ex:
 * "{{força}}d20" referencia "força"/"strength"). Usado para NÃO somar de
 * novo o bônus automático desse atributo (ActionPreset.attribute é somado
 * ao total depois de rolar) quando o mestre já colocou a variável na própria
 * fórmula — evita contar o atributo duas vezes na mesma rolagem.
 */
export function formulaReferencesAttribute(formula: string, attribute: string): boolean {
    const target = resolveAttributeAlias(attribute);
    for (const match of formula.matchAll(VARIABLE_PATTERN)) {
        if (resolveAttributeAlias(match[1]) === target) return true;
    }
    return false;
}

/**
 * Valida se uma string de atributo é utilizável na mesa: um dos 5 fixos ou
 * a key de um CustomAttribute já criado na campanha. Usado ao salvar
 * ActionPreset.attribute/contestAttribute e PresetEffect/CharacterEffect.statAffected.
 */
export async function isValidAttributeKey(attribute: string, campaignId: string): Promise<boolean> {
    if (!attribute) return false;
    if (isFixedAttribute(attribute)) return true;
    const custom = await prisma.customAttribute.findUnique({
        where: { campaignId_key: { campaignId, key: attribute.toLowerCase() } },
        select: { id: true },
    });
    return !!custom;
}
