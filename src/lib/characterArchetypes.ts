import { ActionType, TargetType } from "@prisma/client";
import { attributeTestPresetSeed } from "./customAttributes";

/**
 * Arquétipos de personagem.
 *
 * Cada arquétipo define os atributos base e quais presets de reação são criados.
 * Os 5 presets de teste de atributo são sempre criados (Força/Agilidade/Vigor/Intelecto/Presença).
 */
export type Archetype = "PLAYER" | "ENEMY" | "BOSS" | "MINION" | "NPC";

type AttributeBlock = {
  life: number;
  maxLife: number;
  baseDefense: number;
  strength: number;
  agility: number;
  vigor: number;
  intellect: number;
  presence: number;
};

type ReactionConfig = {
  dodge: boolean;
  block: boolean;
  counterAttack: boolean;
  counterAttackImpact: string; // ex: "1d6"
};

export type ArchetypeDef = {
  label: string;
  description: string;
  defaults: AttributeBlock;
  reactions: ReactionConfig;
};

export const ARCHETYPES: Record<Archetype, ArchetypeDef> = {
  PLAYER: {
    label: "Personagem Jogador",
    description: "Atributos médios, com esquiva, bloqueio e contra-ataque.",
    defaults: {
      life: 30, maxLife: 30, baseDefense: 5,
      strength: 10, agility: 10, vigor: 10, intellect: 10, presence: 10,
    },
    reactions: { dodge: true, block: true, counterAttack: true, counterAttackImpact: "1d6" },
  },
  ENEMY: {
    label: "Inimigo Comum",
    description: "Inimigo padrão. Apenas esquiva.",
    defaults: {
      life: 20, maxLife: 20, baseDefense: 3,
      strength: 8, agility: 8, vigor: 8, intellect: 5, presence: 5,
    },
    reactions: { dodge: true, block: false, counterAttack: false, counterAttackImpact: "1d6" },
  },
  BOSS: {
    label: "Chefão",
    description: "Inimigo poderoso. Todas as reações, contra-ataque mais forte.",
    defaults: {
      life: 80, maxLife: 80, baseDefense: 10,
      strength: 15, agility: 12, vigor: 15, intellect: 12, presence: 12,
    },
    reactions: { dodge: true, block: true, counterAttack: true, counterAttackImpact: "2d6" },
  },
  MINION: {
    label: "Lacaio",
    description: "Inimigo descartável. Vida baixa, sem reações.",
    defaults: {
      life: 8, maxLife: 8, baseDefense: 1,
      strength: 5, agility: 6, vigor: 4, intellect: 3, presence: 3,
    },
    reactions: { dodge: false, block: false, counterAttack: false, counterAttackImpact: "1d4" },
  },
  NPC: {
    label: "NPC pacífico",
    description: "Coadjuvante. Atributos baixos, sem reações.",
    defaults: {
      life: 10, maxLife: 10, baseDefense: 2,
      strength: 6, agility: 6, vigor: 6, intellect: 8, presence: 10,
    },
    reactions: { dodge: false, block: false, counterAttack: false, counterAttackImpact: "1d4" },
  },
};

const ATTRIBUTE_LABEL: Record<string, string> = {
  STRENGTH: "Força",
  AGILITY: "Agilidade",
  VIGOR: "Vigor",
  INTELLECT: "Intelecto",
  PRESENCE: "Presença",
};

type PresetSeed = {
  name: string;
  description: string;
  type: ActionType;
  targetType: TargetType;
  diceFormula: string;
  impactFormula?: string | null;
  modifier: number;
  critThreshold: number | null;
  critMultiplier: number | null;
  requiresTurn: boolean;
  allowOutOfCombat: boolean;
  appliesEffect: boolean;
  attribute: string;
};

/**
 * Gera os 5 testes de atributo fixo + 1 por atributo customizado da mesa +
 * reações conforme o arquétipo. Retorna lista de "seeds" sem characterId
 * (definido no momento da criação no DB).
 */
export function presetSeedsFor(
  archetype: Archetype,
  customAttributes: { key: string; label: string }[] = []
): PresetSeed[] {
  const seeds: PresetSeed[] = [];

  // Testes de atributo (sempre — 5 fixos + os customizados da mesa)
  for (const attr of Object.keys(ATTRIBUTE_LABEL)) {
    seeds.push(attributeTestPresetSeed(attr, ATTRIBUTE_LABEL[attr]) as PresetSeed);
  }
  for (const { key, label } of customAttributes) {
    seeds.push(attributeTestPresetSeed(key, label) as PresetSeed);
  }

  const { reactions } = ARCHETYPES[archetype];

  if (reactions.dodge) {
    seeds.push({
      name: "Esquiva",
      description: "Tenta esquivar de um ataque",
      type: "REACT",
      targetType: "SELF",
      diceFormula: "1d20",
      modifier: 0,
      critThreshold: null,
      critMultiplier: null,
      requiresTurn: false,
      allowOutOfCombat: true,
      appliesEffect: false,
      attribute: "AGILITY",
    });
  }

  if (reactions.block) {
    seeds.push({
      name: "Bloqueio",
      description: "Tenta bloquear um ataque",
      type: "REACT",
      targetType: "SELF",
      diceFormula: "1d20",
      modifier: 0,
      critThreshold: null,
      critMultiplier: null,
      requiresTurn: false,
      allowOutOfCombat: true,
      appliesEffect: false,
      attribute: "VIGOR",
    });
  }

  if (reactions.counterAttack) {
    seeds.push({
      name: "Contra-Ataque",
      description: "Rebate ataques inimigos",
      type: "REACT",
      targetType: "ENEMY",
      diceFormula: "1d20",
      impactFormula: reactions.counterAttackImpact,
      modifier: 0,
      critThreshold: 20,
      critMultiplier: 2,
      requiresTurn: false,
      allowOutOfCombat: true,
      appliesEffect: true,
      attribute: "STRENGTH",
    });
  }

  return seeds;
}
