"use client";

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Stack,
    MenuItem,
    Switch,
    FormControlLabel,
    Divider,
    Typography,
    Box,
    Chip,
    IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { ActionPresetType, PresetEffectType } from "../../types/types";
import { validateDiceFormula } from "../../lib/dice";

/* ─── constants ─────────────────────────────────────────── */

const ACTION_TYPES = [
    { value: "ATTACK",  label: "Ataque" },
    { value: "REACT",   label: "Reação" },
    { value: "SKILL",   label: "Habilidade" },
    { value: "SUPPORT", label: "Suporte" },
    { value: "HEAL",    label: "Cura" },
    { value: "BUFF",    label: "Buff" },
    { value: "DEBUFF",  label: "Debuff" },
    { value: "SPELL",   label: "Magia" },
    { value: "TEST",    label: "Teste" },
    { value: "TRANSFORM", label: "Transformação" },
];

const TARGET_TYPES = [
    { value: "ENEMY",    label: "Inimigo" },
    { value: "ALLY",     label: "Aliado" },
    { value: "SELF",     label: "Em si mesmo" },
    { value: "MULTIPLE", label: "Múltiplos alvos" },
];

const ATTRIBUTES = [
    { value: "STRENGTH",  label: "Força" },
    { value: "AGILITY",   label: "Agilidade" },
    { value: "VIGOR",     label: "Vigor" },
    { value: "INTELLECT", label: "Intelecto" },
    { value: "PRESENCE",  label: "Presença" },
];

const RESOLUTION_TYPES = [
    { value: "DEFENSE",   label: "Defesa (padrão) — total do atacante vs defesa do alvo" },
    { value: "CONTESTED", label: "Teste resistido — total vs 1d20 + atributo do alvo" },
    { value: "AUTO",      label: "Automático — aplica sem precisar de teste" },
];

const EFFECT_SELECTION_MODES = [
    { value: "ALL",        label: "Aplica todos de uma vez" },
    { value: "CHOOSE_ONE", label: "Jogador escolhe 1 (cenários/modos da habilidade)" },
    { value: "CHOOSE_ANY", label: "Jogador escolhe um ou mais" },
];

const EFFECT_TARGETS = [
    { value: "TARGETS", label: "Nos alvos selecionados" },
    { value: "SELF",    label: "No próprio conjurador" },
];

const EFFECT_TYPES = [
    { value: "DAMAGE_OVER_TIME",   label: "Dano por turno" },
    { value: "HEAL_OVER_TIME",     label: "Cura por turno" },
    { value: "STAT_BUFF",          label: "Buff de atributo" },
    { value: "STAT_DEBUFF",        label: "Debuff de atributo" },
    { value: "DEFENSE_BUFF",       label: "Buff de defesa" },
    { value: "DEFENSE_DEBUFF",     label: "Debuff de defesa" },
    { value: "TEMP_HP",            label: "HP Temporário (escudo)" },
    { value: "STUN",               label: "Atordoamento (perde turno)" },
    { value: "ROLL_BONUS",         label: "Bônus nas rolagens" },
    { value: "ROLL_PENALTY",       label: "Penalidade nas rolagens" },
    { value: "CONTROLLED",         label: "Controle mental (usar com Teste resistido)" },
    { value: "DAMAGE_TAKEN_BONUS", label: "Marca — alvo sofre dano extra de qualquer ataque" },
    { value: "SANITY_DRAIN",       label: "Desconto de sanidade" },
];

// Which sub-fields each effect type needs
const EFFECT_NEEDS: Record<string, { duration: boolean; amount: boolean; stat: boolean }> = {
    DAMAGE_OVER_TIME:     { duration: true,  amount: true,  stat: false },
    HEAL_OVER_TIME:       { duration: true,  amount: true,  stat: false },
    STAT_BUFF:            { duration: true,  amount: true,  stat: true  },
    STAT_DEBUFF:          { duration: true,  amount: true,  stat: true  },
    DEFENSE_BUFF:         { duration: true,  amount: true,  stat: false },
    DEFENSE_DEBUFF:       { duration: true,  amount: true,  stat: false },
    TEMP_HP:              { duration: false, amount: true,  stat: false },
    STUN:                 { duration: true,  amount: false, stat: false },
    ROLL_BONUS:           { duration: true,  amount: true,  stat: false },
    ROLL_PENALTY:         { duration: true,  amount: true,  stat: false },
    CONTROLLED:           { duration: true,  amount: false, stat: false },
    DAMAGE_TAKEN_BONUS:   { duration: true,  amount: true,  stat: false },
    SANITY_DRAIN:         { duration: false, amount: true,  stat: false },
};

// Types that have an impact formula (dano/cura/valor)
const HAS_IMPACT = new Set(["ATTACK", "REACT", "SUPPORT", "HEAL", "BUFF", "DEBUFF", "SPELL"]);
// Types where critical hits make sense
const HAS_CRIT = new Set(["ATTACK", "REACT", "SPELL"]);

/* ─── effect row (form-friendly, campos numéricos como string) ──── */

type EffectRow = {
    _key: string; // chave estável para o React (id existente ou gerado no front)
    id?: string;
    name: string;
    description: string;
    effectType: string;
    target: "SELF" | "TARGETS";
    value: string;
    valueFormula: string;
    statAffected: string;
    statusApplied: string;
    durationTurns: string;
    retestEachRound: boolean;
    contestDecay: string;
};

let rowSeq = 0;
function blankRow(): EffectRow {
    rowSeq += 1;
    return {
        _key: `new-${rowSeq}`,
        name: "",
        description: "",
        effectType: "",
        target: "TARGETS",
        value: "",
        valueFormula: "",
        statAffected: "",
        statusApplied: "",
        durationTurns: "",
        retestEachRound: false,
        contestDecay: "",
    };
}

function rowFromPresetEffect(e: PresetEffectType): EffectRow {
    return {
        _key: e.id,
        id: e.id,
        name: e.name,
        description: e.description ?? "",
        effectType: e.effectType,
        target: e.target === "SELF" ? "SELF" : "TARGETS",
        value: e.value != null ? String(e.value) : "",
        valueFormula: e.valueFormula ?? "",
        statAffected: e.statAffected ?? "",
        statusApplied: e.statusApplied ?? "",
        durationTurns: e.durationTurns != null ? String(e.durationTurns) : "",
        retestEachRound: !!e.retestEachRound,
        contestDecay: e.contestDecay != null ? String(e.contestDecay) : "",
    };
}

/* ─── default form ───────────────────────────────────────── */

const BLANK = {
    name: "",
    description: "",
    type: "ATTACK",
    targetType: "ENEMY",
    attribute: "STRENGTH",
    diceFormula: "1d20",
    impactFormula: "",
    modifier: 0,
    critThreshold: 20,
    critMultiplier: 2,
    requiresTurn: true,
    allowOutOfCombat: false,
    isAreaEffect: false,
    transformedOnly: false,
    resolution: "DEFENSE" as string,
    contestAttribute: "" as string,
    effectSelectionMode: "ALL" as string,
    usesPerDay: "" as string,
    targetFormId: "" as string,
    effects: [] as EffectRow[],
};

/* ─── section label helper ───────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            variant="caption"
            sx={{ display: "block", fontWeight: 700, color: "#888",
                  textTransform: "uppercase", letterSpacing: 0.6, mb: 0.5 }}
        >
            {children}
        </Typography>
    );
}

/* ─── component ──────────────────────────────────────────── */

type Props = {
    open: boolean;
    characterId: string;
    preset?: ActionPresetType | null;
    onClose: () => void;
};

export function PresetModal({ open, characterId, preset, onClose }: Props) {
    const [form, setForm] = useState(BLANK);
    const [diceError, setDiceError]     = useState<string | null>(null);
    const [impactError, setImpactError] = useState<string | null>(null);
    const [saving, setSaving]           = useState(false);

    // Formas disponíveis pro seletor "Forma-alvo" (type=TRANSFORM) — mesmo
    // shape do formGroup de GET /characters/[id] (ficha principal + formas)
    const [formGroupOptions, setFormGroupOptions] = useState<{ id: string; name: string }[]>([]);
    const [primaryId, setPrimaryId] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !characterId) return;
        api.get(`/characters/${characterId}`)
            .then(res => {
                const fg = res.data?.formGroup;
                setFormGroupOptions(fg?.options ?? []);
                setPrimaryId(fg?.primaryId ?? null);
            })
            .catch(() => {
                setFormGroupOptions([]);
                setPrimaryId(null);
            });
    }, [open, characterId]);

    useEffect(() => {
        if (open) {
            setDiceError(null);
            setImpactError(null);
            if (preset) {
                const legacyRow: EffectRow | null =
                    preset.effectType
                        ? {
                            _key: "legacy",
                            name: preset.name,
                            description: "",
                            effectType: preset.effectType,
                            target: "TARGETS",
                            value: preset.effectAmount != null ? String(preset.effectAmount) : "",
                            valueFormula: "",
                            statAffected: preset.statAffected ?? "",
                            statusApplied: preset.statusApplied ?? "",
                            durationTurns: preset.durationTurns != null ? String(preset.durationTurns) : "",
                            retestEachRound: false,
                            contestDecay: "",
                        }
                        : null;

                setForm({
                    name:            preset.name,
                    description:     preset.description ?? "",
                    type:            preset.type,
                    targetType:      preset.targetType,
                    attribute:       preset.attribute,
                    diceFormula:     preset.diceFormula,
                    impactFormula:   preset.impactFormula ?? "",
                    modifier:        preset.modifier ?? 0,
                    critThreshold:   preset.critThreshold ?? 20,
                    critMultiplier:  preset.critMultiplier ?? 2,
                    requiresTurn:    preset.requiresTurn ?? true,
                    allowOutOfCombat:preset.allowOutOfCombat ?? false,
                    isAreaEffect:    preset.isAreaEffect ?? false,
                    transformedOnly: preset.transformedOnly ?? false,
                    resolution:      preset.resolution ?? "DEFENSE",
                    contestAttribute:preset.contestAttribute ?? "",
                    effectSelectionMode: preset.effectSelectionMode ?? "ALL",
                    usesPerDay:      preset.usesPerDay != null ? String(preset.usesPerDay) : "",
                    targetFormId:    preset.targetFormId ?? "",
                    effects: preset.effects && preset.effects.length > 0
                        ? preset.effects.map(rowFromPresetEffect)
                        : legacyRow ? [legacyRow] : [],
                });
            } else {
                setForm(BLANK);
            }
        }
    }, [preset, open]);

    const update = (key: string, value: string | number | boolean) => {
        setForm(prev => ({ ...prev, [key]: value }));
        if (key === "diceFormula")  setDiceError(null);
        if (key === "impactFormula") setImpactError(null);
    };

    const updateRow = (key: string, patch: Partial<EffectRow>) => {
        setForm(prev => ({
            ...prev,
            effects: prev.effects.map(r => r._key === key ? { ...r, ...patch } : r),
        }));
    };

    const addRow = () => setForm(prev => ({ ...prev, effects: [...prev.effects, blankRow()] }));
    const removeRow = (key: string) => setForm(prev => ({ ...prev, effects: prev.effects.filter(r => r._key !== key) }));

    const showImpact  = HAS_IMPACT.has(form.type);
    const showCrit    = HAS_CRIT.has(form.type);
    const showArea    = form.targetType === "ENEMY" || form.targetType === "MULTIPLE";
    const isContested = form.resolution === "CONTESTED";

    // TRANSFORM (auto-gerado em POST .../forms, ou escolhido manualmente
    // aqui) não rola dado nem aplica efeito — só nome/descrição/forma-alvo
    // importam; os demais campos ficam ocultos e vão com valores fixos
    const formTypeIsTransform = form.type === "TRANSFORM";

    const handleSave = async () => {
        if (!form.name.trim()) return;

        if (formTypeIsTransform) {
            const payload = {
                name: form.name.trim(),
                description: form.description,
                type: "TRANSFORM",
                targetFormId: form.targetFormId || null,
                targetType: "SELF",
                diceFormula: "0",
                attribute: "STRENGTH",
                modifier: 0,
                impactFormula: null,
                critThreshold: null,
                critMultiplier: null,
                requiresTurn: false,
                allowOutOfCombat: true,
                isAreaEffect: false,
                transformedOnly: false,
                resolution: "DEFENSE",
                contestAttribute: null,
                effectSelectionMode: "ALL",
                usesPerDay: null,
                appliesEffect: false,
                effects: [],
                characterId,
            };
            setSaving(true);
            try {
                if (preset?.id) {
                    await api.put(`/actionPreset/${preset.id}`, payload);
                } else {
                    await api.post("/actionPreset", payload);
                }
                setForm(BLANK);
                onClose();
            } finally {
                setSaving(false);
            }
            return;
        }

        const diceErr   = validateDiceFormula(form.diceFormula);
        const impactErr = form.impactFormula ? validateDiceFormula(form.impactFormula) : null;
        if (diceErr)   { setDiceError(diceErr);     return; }
        if (impactErr) { setImpactError(impactErr); return; }
        if (!form.name.trim()) { setDiceError(null); return; }

        const effects = form.effects
            .filter(r => r.name.trim() && r.effectType)
            .map(r => {
                const needs = EFFECT_NEEDS[r.effectType];
                return {
                    name: r.name.trim(),
                    description: r.description || null,
                    effectType: r.effectType,
                    target: r.target,
                    value: needs?.amount && r.value !== "" ? Number(r.value) : null,
                    valueFormula: needs?.amount && r.valueFormula ? r.valueFormula : null,
                    statAffected: needs?.stat && r.statAffected ? r.statAffected : null,
                    statusApplied: r.effectType === "STUN" ? (r.statusApplied || null) : null,
                    durationTurns: needs?.duration && r.durationTurns !== "" ? Number(r.durationTurns) : null,
                    retestEachRound: isContested && r.retestEachRound,
                    contestDecay: isContested && r.retestEachRound && r.contestDecay !== "" ? Number(r.contestDecay) : null,
                };
            });

        const payload = {
            name:            form.name.trim(),
            description:     form.description,
            type:            form.type,
            targetType:      form.targetType,
            attribute:       form.attribute,
            diceFormula:     form.diceFormula,
            impactFormula:   form.impactFormula || null,
            modifier:        Number(form.modifier),
            critThreshold:   showCrit ? Number(form.critThreshold) : null,
            critMultiplier:  showCrit ? Number(form.critMultiplier) : null,
            requiresTurn:    form.requiresTurn,
            allowOutOfCombat:form.allowOutOfCombat,
            isAreaEffect:    showArea ? form.isAreaEffect : false,
            transformedOnly: form.transformedOnly,
            resolution:      form.resolution,
            contestAttribute:isContested && form.contestAttribute ? form.contestAttribute : null,
            effectSelectionMode: effects.length > 1 ? form.effectSelectionMode : "ALL",
            usesPerDay:      form.usesPerDay !== "" ? Number(form.usesPerDay) : null,
            // Efeitos migram totalmente para o modelo novo — os campos legados
            // de efeito único deixam de ser usados a partir daqui
            appliesEffect:   effects.length > 0,
            effects,
            durationTurns: null,
            statAffected: null,
            effectAmount: null,
            statusApplied: null,
            effectType: null,
            characterId,
        };

        setSaving(true);
        try {
            if (preset?.id) {
                await api.put(`/actionPreset/${preset.id}`, payload);
            } else {
                await api.post("/actionPreset", payload);
            }
            setForm(BLANK);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setForm(BLANK);
        setDiceError(null);
        setImpactError(null);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={(_e, reason) => { if (reason !== "backdropClick") handleClose(); }}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { bgcolor: "#12121e", backgroundImage: "none" } }}
        >
            <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                {preset ? "Editar Preset" : "Novo Preset"}
                {preset && (
                    <Chip label={preset.type} size="small"
                        sx={{ fontSize: 10, height: 20, bgcolor: "rgba(107,122,219,0.15)", color: "#8B9DFF" }} />
                )}
            </DialogTitle>

            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>

                    {/* ── Identificação ── */}
                    <Box>
                        <SectionLabel>Identificação</SectionLabel>
                        <Stack spacing={1.5}>
                            <TextField
                                label="Nome"
                                value={form.name}
                                onChange={e => update("name", e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleSave()}
                                required
                                fullWidth
                                size="small"
                            />
                            <TextField
                                label="Descrição"
                                multiline
                                minRows={6}
                                maxRows={20}
                                value={form.description}
                                onChange={e => update("description", e.target.value)}
                                fullWidth size="small"
                                sx={{ "& textarea": { resize: "vertical" } }}
                            />
                        </Stack>
                    </Box>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

                    {/* ── Tipo e alvo ── */}
                    <Box>
                        <SectionLabel>Tipo e Alvo</SectionLabel>
                        <Stack direction="row" spacing={1.5}>
                            <TextField select label="Tipo" value={form.type}
                                onChange={e => update("type", e.target.value)} fullWidth size="small">
                                {ACTION_TYPES.map(t => (
                                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                ))}
                            </TextField>
                            {formTypeIsTransform ? (
                                <TextField select label="Forma-alvo" value={form.targetFormId}
                                    onChange={e => update("targetFormId", e.target.value)} fullWidth size="small"
                                    helperText="Vazio = volta à forma base">
                                    <MenuItem value="">Voltar à forma base</MenuItem>
                                    {formGroupOptions.filter(o => o.id !== primaryId).map(o => (
                                        <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                                    ))}
                                </TextField>
                            ) : (
                                <>
                                    <TextField select label="Alvo" value={form.targetType}
                                        onChange={e => update("targetType", e.target.value)} fullWidth size="small">
                                        {TARGET_TYPES.map(t => (
                                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField select label="Atributo" value={form.attribute}
                                        onChange={e => update("attribute", e.target.value)} fullWidth size="small">
                                        {ATTRIBUTES.map(a => (
                                            <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                                        ))}
                                    </TextField>
                                </>
                            )}
                        </Stack>
                        {formTypeIsTransform && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                Transformação não consome turno nem rola dado — o limite de usos fica
                                no personagem (campo &quot;Transformações por dia&quot; na ficha), não neste preset.
                            </Typography>
                        )}
                    </Box>

                    {!formTypeIsTransform && <>
                    <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

                    {/* ── Rolagem ── */}
                    <Box>
                        <SectionLabel>Rolagem</SectionLabel>
                        <Stack direction="row" spacing={1.5}>
                            <TextField
                                label="Dado de ataque"
                                value={form.diceFormula}
                                onChange={e => update("diceFormula", e.target.value)}
                                error={!!diceError}
                                helperText={diceError ?? "Ex: 1d20, 1d8+1d4"}
                                fullWidth size="small"
                            />
                            {showImpact && (
                                <TextField
                                    label={form.type === "HEAL" || form.type === "SUPPORT" ? "Fórmula de cura" : "Fórmula de impacto"}
                                    value={form.impactFormula}
                                    onChange={e => update("impactFormula", e.target.value)}
                                    error={!!impactError}
                                    helperText={impactError ?? "Ex: 2d6+3"}
                                    fullWidth size="small"
                                />
                            )}
                            <TextField
                                label="Modificador"
                                type="number"
                                value={form.modifier}
                                onChange={e => update("modifier", e.target.value)}
                                sx={{ maxWidth: 110 }} size="small"
                                helperText="Bônus fixo"
                            />
                        </Stack>

                        {showCrit && (
                            <Stack direction="row" spacing={1.5} mt={1.5}>
                                <TextField
                                    label="Crítico ≥"
                                    type="number"
                                    value={form.critThreshold}
                                    onChange={e => update("critThreshold", e.target.value)}
                                    fullWidth size="small"
                                    helperText="Valor mínimo para crít. (0 = desativado)"
                                />
                                <TextField
                                    label="Multiplicador crítico"
                                    type="number"
                                    value={form.critMultiplier}
                                    onChange={e => update("critMultiplier", e.target.value)}
                                    fullWidth size="small"
                                    helperText="Ex: 2 = dano dobrado no crít."
                                />
                            </Stack>
                        )}
                    </Box>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

                    {/* ── Resolução ── */}
                    <Box>
                        <SectionLabel>Resolução</SectionLabel>
                        <Stack direction="row" spacing={1.5}>
                            <TextField select label="Como resolve contra o alvo" value={form.resolution}
                                onChange={e => update("resolution", e.target.value)} fullWidth size="small">
                                {RESOLUTION_TYPES.map(r => (
                                    <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                                ))}
                            </TextField>
                            {isContested && (
                                <TextField select label="Atributo de resistência do alvo" value={form.contestAttribute}
                                    onChange={e => update("contestAttribute", e.target.value)} fullWidth size="small"
                                    helperText="Vazio = mesmo atributo desta habilidade">
                                    <MenuItem value=""><em>Mesmo atributo</em></MenuItem>
                                    {ATTRIBUTES.map(a => (
                                        <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                                    ))}
                                </TextField>
                            )}
                        </Stack>
                        {isContested && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                O alvo rola 1d20 + atributo escolhido; se tirar mais que o total desta habilidade, resiste. Não abre esquiva/bloqueio — o teste resistido já é a defesa.
                            </Typography>
                        )}
                    </Box>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

                    {/* ── Regras ── */}
                    <Box>
                        <SectionLabel>Regras</SectionLabel>
                        <Stack direction="row" flexWrap="wrap" gap={0.5} alignItems="center">
                            <FormControlLabel
                                control={<Switch size="small" checked={form.requiresTurn} onChange={e => update("requiresTurn", e.target.checked)} />}
                                label={<Typography fontSize={13}>Consome turno</Typography>}
                            />
                            <FormControlLabel
                                control={<Switch size="small" checked={form.allowOutOfCombat} onChange={e => update("allowOutOfCombat", e.target.checked)} />}
                                label={<Typography fontSize={13}>Usar fora de combate</Typography>}
                            />
                            {showArea && (
                                <FormControlLabel
                                    control={<Switch size="small" checked={form.isAreaEffect} onChange={e => update("isAreaEffect", e.target.checked)} />}
                                    label={<Typography fontSize={13}>Área / múltiplos alvos</Typography>}
                                />
                            )}
                            <FormControlLabel
                                control={<Switch size="small" checked={form.transformedOnly} onChange={e => update("transformedOnly", e.target.checked)} />}
                                label={<Typography fontSize={13}>Habilidade da forma transformada</Typography>}
                            />
                        </Stack>
                        {form.transformedOnly && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                Esta habilidade só aparece para uso enquanto o personagem estiver transformado —
                                destransformado, ela some do combate e das ações da ficha.
                            </Typography>
                        )}
                        <TextField
                            label="Usos por dia"
                            type="number"
                            value={form.usesPerDay}
                            onChange={e => update("usesPerDay", e.target.value)}
                            sx={{ mt: 1.5, maxWidth: 220 }}
                            size="small"
                            inputProps={{ min: 1 }}
                            helperText="Vazio = ilimitado. O mestre avança o dia do mundo em Minhas Mesas."
                        />
                    </Box>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

                    {/* ── Efeitos ── */}
                    <Box>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                            <SectionLabel>Efeitos</SectionLabel>
                            <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
                                Adicionar efeito
                            </Button>
                        </Stack>

                        {form.effects.length > 1 && (
                            <TextField select label="Quando usar, o jogador…" value={form.effectSelectionMode}
                                onChange={e => update("effectSelectionMode", e.target.value)} fullWidth size="small"
                                sx={{ mb: 1.5 }}>
                                {EFFECT_SELECTION_MODES.map(m => (
                                    <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                                ))}
                            </TextField>
                        )}

                        {form.effects.length === 0 && (
                            <Typography variant="caption" color="text.secondary">
                                Nenhum efeito configurado — a ação só rola dado/dano, sem aplicar nada além disso.
                            </Typography>
                        )}

                        <Stack spacing={1.5}>
                            {form.effects.map((row, idx) => {
                                const needs = row.effectType ? EFFECT_NEEDS[row.effectType] : null;
                                return (
                                    <Box key={row._key}
                                        sx={{ p: 1.5, borderRadius: 1, border: "1px solid rgba(167,139,250,0.2)", bgcolor: "rgba(167,139,250,0.04)" }}>
                                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                            <Stack spacing={1.5} flex={1}>
                                                <Stack direction="row" spacing={1.5}>
                                                    <TextField
                                                        label={form.effects.length > 1 ? `Nome do efeito ${idx + 1}` : "Nome do efeito"}
                                                        value={row.name}
                                                        onChange={e => updateRow(row._key, { name: e.target.value })}
                                                        placeholder="Ex: Quebrar Armadura"
                                                        fullWidth size="small"
                                                    />
                                                    <TextField select label="Tipo" value={row.effectType}
                                                        onChange={e => updateRow(row._key, { effectType: e.target.value })}
                                                        fullWidth size="small">
                                                        <MenuItem value=""><em>Selecione…</em></MenuItem>
                                                        {EFFECT_TYPES.map(et => (
                                                            <MenuItem key={et.value} value={et.value}>{et.label}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                    <TextField select label="Alvo" value={row.target}
                                                        onChange={e => updateRow(row._key, { target: e.target.value as "SELF" | "TARGETS" })}
                                                        sx={{ minWidth: 180 }} size="small">
                                                        {EFFECT_TARGETS.map(t => (
                                                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                </Stack>

                                                {form.effects.length > 1 && (
                                                    <TextField
                                                        label="Descrição (aparece na escolha do jogador)"
                                                        value={row.description}
                                                        onChange={e => updateRow(row._key, { description: e.target.value })}
                                                        fullWidth size="small"
                                                    />
                                                )}

                                                {needs && (
                                                    <Stack direction="row" spacing={1.5}>
                                                        {needs.stat && (
                                                            <TextField select label="Atributo afetado" value={row.statAffected}
                                                                onChange={e => updateRow(row._key, { statAffected: e.target.value })} fullWidth size="small">
                                                                {ATTRIBUTES.map(a => (
                                                                    <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                                                                ))}
                                                            </TextField>
                                                        )}
                                                        {needs.amount && (
                                                            <TextField
                                                                label={row.effectType === "TEMP_HP" ? "HP temporário" : "Valor fixo"}
                                                                type="number"
                                                                value={row.value}
                                                                onChange={e => updateRow(row._key, { value: e.target.value })}
                                                                fullWidth size="small"
                                                                helperText={row.effectType === "STAT_DEBUFF" || row.effectType === "DEFENSE_DEBUFF" ? "Positivo — negado automaticamente" : undefined}
                                                            />
                                                        )}
                                                        {needs.amount && (
                                                            <TextField
                                                                label="ou fórmula de dado"
                                                                value={row.valueFormula}
                                                                onChange={e => updateRow(row._key, { valueFormula: e.target.value })}
                                                                placeholder="Ex: 1d6"
                                                                fullWidth size="small"
                                                                helperText={row.effectType === "DAMAGE_TAKEN_BONUS" ? "Rolada a cada ataque recebido" : "Se preenchida, tem prioridade sobre o valor fixo"}
                                                            />
                                                        )}
                                                        {needs.duration && (
                                                            <TextField
                                                                label="Duração (turnos)"
                                                                type="number"
                                                                value={row.durationTurns}
                                                                onChange={e => updateRow(row._key, { durationTurns: e.target.value })}
                                                                fullWidth size="small"
                                                                inputProps={{ min: 1 }}
                                                            />
                                                        )}
                                                    </Stack>
                                                )}

                                                {isContested && needs?.duration && (
                                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                                        <FormControlLabel
                                                            control={<Switch size="small" checked={row.retestEachRound}
                                                                onChange={e => updateRow(row._key, { retestEachRound: e.target.checked })} />}
                                                            label={<Typography fontSize={13}>Repete o teste a cada rodada (alvo pode se libertar)</Typography>}
                                                        />
                                                        {row.retestEachRound && (
                                                            <TextField
                                                                label="Decaimento por rodada"
                                                                type="number"
                                                                value={row.contestDecay}
                                                                onChange={e => updateRow(row._key, { contestDecay: e.target.value })}
                                                                sx={{ maxWidth: 200 }} size="small"
                                                                helperText="Ex: 2 → valor a bater cai 19, 17, 15…"
                                                            />
                                                        )}
                                                    </Stack>
                                                )}
                                            </Stack>

                                            <IconButton size="small" onClick={() => removeRow(row._key)} sx={{ mt: 0.5 }}>
                                                <DeleteIcon sx={{ fontSize: 16, color: "#888" }} />
                                            </IconButton>
                                        </Stack>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Box>
                    </>}
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={handleClose} color="inherit" disabled={saving}>Cancelar</Button>
                <Button variant="contained" onClick={handleSave} disabled={saving || !form.name.trim()}>
                    {saving ? "Salvando…" : "Salvar"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
