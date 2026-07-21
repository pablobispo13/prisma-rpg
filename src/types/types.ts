export type Character = {
    // Identidade
    id: string;
    name: string;
    image: string;
    baseDefense: number
    // Controle
    ownerId?: string;
    owner?: CharacterOwner;
    campaignId?: string;
    history?: string
    notes?: string

    // Recursos
    life: number;
    maxLife: number;
    xp: number;

    // Sanidade — só vem preenchida na resposta da API quando o requisitante
    // é o mestre da mesa (o servidor remove os dois campos para jogadores).
    // undefined = campo ausente da resposta (jogador, ou não configurado).
    sanity?: number | null;
    maxSanity?: number | null;
    abilitySanityCostOverride?: number | null;

    // Atributos base
    strength: number;
    agility: number;
    vigor: number;
    intellect: number;
    presence: number;

    // Overrides dos limites da mesa (null = usa o da campanha)
    maxReactionsPerRound?: number | null;
    maxAttacksPerRound?: number | null;
    maxTransformationsPerDay?: number | null;

    // Formas alternativas (transformações)
    primaryFormId?: string | null;
    activeFormId?: string | null;
    formGroup?: CharacterFormGroup | null;

    // Sistemas
    inventory: CharacterInventory[];
    presets: ActionPresetType[];
    statusEffects: CharacterStatusEffect[];

    // Histórico
    actionLogs: ActionLog[]
};
export type CharacterFormGroup = {
    primaryId: string;
    activeId: string;
    options: { id: string; name: string; image: string | null }[];
};

export type Log = {
    id: string;
    name: string;
    message: string
};

export type OwnerRole = "MESTRE" | "JOGADOR";
export type CharacterOwner = {
    username: string;
    role: OwnerRole;
};
export type CharacterInventory = {
    id: string;
    name: string;
    quantity: number;
    description: string
    preset?: ActionPresetType | null;
};

export type ActionPresetType = {
    id: string;
    characterId: string;
    name: string;
    description?: string | null;
    type: "SKILL" | "ATTACK" | "TEST" | "REACT" | "SUPPORT" | "SPELL" | "HEAL" | "BUFF" | "DEBUFF";
    targetType: string;
    diceFormula: string;
    impactFormula?: string | null;
    modifier: number;
    attribute: string;
    critThreshold?: number | null;
    critMultiplier?: number | null;
    requiresTurn?: boolean;
    allowOutOfCombat?: boolean;
    appliesEffect?: boolean;
    isAreaEffect?: boolean;
    transformedOnly?: boolean;
    // Campos legados de efeito único — mantidos como fallback para presets
    // ainda não migrados para `effects` (linhas de PresetEffect)
    durationTurns?: number | null;
    statAffected?: string | null;
    effectAmount?: number | null;
    statusApplied?: string | null;
    effectType?: string | null;

    // Resolução da rolagem contra o alvo
    resolution?: "DEFENSE" | "CONTESTED" | "AUTO";
    contestAttribute?: string | null;
    // Limite de usos por dia (null = ilimitado)
    usesPerDay?: number | null;
    // Uso já registrado no worldDay atual (só vem preenchido no GET de
    // combate, escopado ao dia vigente da mesa — ver combat/[id].ts)
    dailyUsages?: { usedCount: number }[];
    // Multi-efeito: quando presente e não-vazio, substitui os campos legados
    effectSelectionMode?: "ALL" | "CHOOSE_ONE" | "CHOOSE_ANY";
    effects?: PresetEffectType[];
};

export type PresetEffectType = {
    id: string;
    name: string;
    description?: string | null;
    effectType: string;
    target: "SELF" | "TARGETS";
    value?: number | null;
    valueFormula?: string | null;
    statAffected?: string | null;
    statusApplied?: string | null;
    durationTurns?: number | null;
    retestEachRound?: boolean;
    contestDecay?: number | null;
    sortOrder?: number;
};

export type CharacterStatusEffect = {
    id: string;
    type: string;
    remainingTurns: number;
};
export type Roll = {
    id: string;
    type: string;
    total: number;
    modifier: number;
    rolls: number[];
    damage?: number | null;
    healing?: number | null;
    sucess?: boolean | null;
    success?: boolean | null;
    critical?: boolean | null;
    diceRolled?: string;
    impactRolls?: number[];
    createdAt?: string;
    preset?: ActionPresetType | null;
    reactionType?: "DODGE" | "COUNTER_ATTACK" | "BLOCK" | "SKIP";
};

export type ActionLog = {
    id: string;
    type: string;
    message: string;
    // Visível apenas para o mestre (o servidor filtra para jogadores)
    masterOnly?: boolean | null;
    roll?: Roll;
    character?: { id: string; name: string } | null;
    target?: { id: string; name: string } | null;
};
export const Character_Attributes = [
    { key: "strength", label: "Força" },
    { key: "agility", label: "Agilidade" },
    { key: "vigor", label: "Vigor" },
    { key: "intellect", label: "Intelecto" },
    { key: "presence", label: "Presença" },
] as const;

export const getLifePercent = (life: number, maxLife: number) =>
    Math.max(0, Math.min(100, (life / maxLife) * 100));
