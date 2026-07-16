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
} from "@mui/material";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { ActionPresetType } from "../../types/types";
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

const EFFECT_TYPES = [
    { value: "DAMAGE_OVER_TIME", label: "Dano por turno" },
    { value: "HEAL_OVER_TIME",   label: "Cura por turno" },
    { value: "STAT_BUFF",        label: "Buff de atributo" },
    { value: "STAT_DEBUFF",      label: "Debuff de atributo" },
    { value: "TEMP_HP",          label: "HP Temporário (escudo)" },
    { value: "STUN",             label: "Atordoamento (perde turno)" },
    { value: "ROLL_BONUS",       label: "Bônus nas rolagens" },
    { value: "ROLL_PENALTY",     label: "Penalidade nas rolagens" },
];

// Which sub-fields each effect type needs
const EFFECT_NEEDS: Record<string, { duration: boolean; amount: boolean; stat: boolean }> = {
    DAMAGE_OVER_TIME: { duration: true,  amount: true,  stat: false },
    HEAL_OVER_TIME:   { duration: true,  amount: true,  stat: false },
    STAT_BUFF:        { duration: true,  amount: true,  stat: true  },
    STAT_DEBUFF:      { duration: true,  amount: true,  stat: true  },
    TEMP_HP:          { duration: false, amount: true,  stat: false },
    STUN:             { duration: true,  amount: false, stat: false },
    ROLL_BONUS:       { duration: true,  amount: true,  stat: false },
    ROLL_PENALTY:     { duration: true,  amount: true,  stat: false },
};

// Types that have an impact formula (dano/cura/valor)
const HAS_IMPACT = new Set(["ATTACK", "REACT", "SUPPORT", "HEAL", "BUFF", "DEBUFF", "SPELL"]);
// Types where critical hits make sense
const HAS_CRIT = new Set(["ATTACK", "REACT", "SPELL"]);

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
    appliesEffect: false,
    isAreaEffect: false,
    transformedOnly: false,
    effectType: "",
    durationTurns: "",
    statAffected: "",
    effectAmount: "",
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

    useEffect(() => {
        if (open) {
            setDiceError(null);
            setImpactError(null);
            if (preset) {
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
                    appliesEffect:   preset.appliesEffect ?? false,
                    isAreaEffect:    preset.isAreaEffect ?? false,
                    transformedOnly: preset.transformedOnly ?? false,
                    effectType:      (preset as any).effectType ?? "",
                    durationTurns:   preset.durationTurns?.toString() ?? "",
                    statAffected:    preset.statAffected ?? "",
                    effectAmount:    preset.effectAmount?.toString() ?? "",
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

    const effectNeeds = form.effectType ? EFFECT_NEEDS[form.effectType] : null;
    const showImpact  = HAS_IMPACT.has(form.type);
    const showCrit    = HAS_CRIT.has(form.type);
    const showArea    = form.targetType === "ENEMY" || form.targetType === "MULTIPLE";

    const handleSave = async () => {
        const diceErr   = validateDiceFormula(form.diceFormula);
        const impactErr = form.impactFormula ? validateDiceFormula(form.impactFormula) : null;
        if (diceErr)   { setDiceError(diceErr);     return; }
        if (impactErr) { setImpactError(impactErr); return; }
        if (!form.name.trim()) { setDiceError(null); return; }

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
            appliesEffect:   form.appliesEffect,
            effectType:      form.appliesEffect && form.effectType ? form.effectType : null,
            durationTurns:   form.appliesEffect && effectNeeds?.duration && form.durationTurns
                                 ? Number(form.durationTurns) : null,
            statAffected:    form.appliesEffect && effectNeeds?.stat && form.statAffected
                                 ? form.statAffected : null,
            effectAmount:    form.appliesEffect && effectNeeds?.amount && form.effectAmount
                                 ? Number(form.effectAmount) : null,
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
                                multiline rows={2}
                                value={form.description}
                                onChange={e => update("description", e.target.value)}
                                fullWidth size="small"
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
                        </Stack>
                    </Box>

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

                    {/* ── Regras ── */}
                    <Box>
                        <SectionLabel>Regras</SectionLabel>
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
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
                    </Box>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

                    {/* ── Efeito ── */}
                    <Box>
                        <SectionLabel>Efeito</SectionLabel>
                        <FormControlLabel
                            control={<Switch size="small" checked={form.appliesEffect} onChange={e => update("appliesEffect", e.target.checked)} />}
                            label={<Typography fontSize={13}>Esta ação aplica um efeito no alvo</Typography>}
                        />

                        {form.appliesEffect && (
                            <Stack spacing={1.5} mt={1.5}
                                sx={{ p: 1.5, borderRadius: 1, border: "1px solid rgba(167,139,250,0.2)", bgcolor: "rgba(167,139,250,0.04)" }}>

                                <TextField select label="Tipo de efeito" value={form.effectType}
                                    onChange={e => update("effectType", e.target.value)} fullWidth size="small">
                                    <MenuItem value=""><em>Selecione…</em></MenuItem>
                                    {EFFECT_TYPES.map(et => (
                                        <MenuItem key={et.value} value={et.value}>{et.label}</MenuItem>
                                    ))}
                                </TextField>

                                {effectNeeds && (
                                    <Stack direction="row" spacing={1.5}>
                                        {effectNeeds.stat && (
                                            <TextField select label="Atributo afetado" value={form.statAffected}
                                                onChange={e => update("statAffected", e.target.value)} fullWidth size="small">
                                                {ATTRIBUTES.map(a => (
                                                    <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                                                ))}
                                            </TextField>
                                        )}
                                        {effectNeeds.amount && (
                                            <TextField
                                                label={form.effectType === "TEMP_HP" ? "HP temporário" : "Valor"}
                                                type="number"
                                                value={form.effectAmount}
                                                onChange={e => update("effectAmount", e.target.value)}
                                                fullWidth size="small"
                                                helperText={form.effectType === "STAT_DEBUFF" ? "Valor positivo — será negado automaticamente" : undefined}
                                            />
                                        )}
                                        {effectNeeds.duration && (
                                            <TextField
                                                label="Duração (turnos)"
                                                type="number"
                                                value={form.durationTurns}
                                                onChange={e => update("durationTurns", e.target.value)}
                                                fullWidth size="small"
                                                inputProps={{ min: 1 }}
                                            />
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        )}
                    </Box>
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
