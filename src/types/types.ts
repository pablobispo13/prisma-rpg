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

    // Atributos base
    strength: number;
    agility: number;
    vigor: number;
    intellect: number;
    presence: number;

    // Overrides dos limites da mesa (null = usa o da campanha)
    maxReactionsPerRound?: number | null;
    maxAttacksPerRound?: number | null;

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
    durationTurns?: number | null;
    statAffected?: string | null;
    effectAmount?: number | null;
    statusApplied?: string | null;
    effects?: CharacterStatusEffect[]
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
