"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Divider,
  Box,
  Typography,
  Avatar,
  MenuItem,
} from "@mui/material";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { characterImageSrc } from "../../lib/characterImage";
import { Character } from "../../types/types";
import {
  calculateMaxLife,
  calculateDefense,
  DEFAULT_MAX_LIFE_FORMULA,
  DEFAULT_DEFENSE_FORMULA,
} from "../../lib/characterCalculations";
import { useAuth } from "../../context/AuthContext";
import { useCampaign } from "../../context/CampaignContext";
import { ImagePicker } from "./ImagePicker";

type Props = {
  open: boolean;
  character: Character | null;
  onClose: () => void;
};

const BLANK = {
  name: "",
  life: 0,
  maxLife: 0,
  xp: 0,
  baseDefense: 0,
  history: "",
  notes: "",
  image: "",
  strength: 0,
  agility: 0,
  vigor: 0,
  intellect: 0,
  presence: 0,
  maxReactionsPerRound: "" as string | number,
  maxAttacksPerRound: "" as string | number,
  maxTransformationsPerDay: "" as string | number,
  sanity: "" as string | number,
  maxSanity: "" as string | number,
  abilitySanityCostOverride: "" as string | number,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" fontWeight="bold" color="text.secondary">
      {children}
    </Typography>
  );
}

export function CharacterStatsModal({ open, character, onClose }: Props) {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const isAdmin = !!user?.isAdmin;
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const maxLifeFormula = activeCampaign?.maxLifeFormula ?? DEFAULT_MAX_LIFE_FORMULA;
  const defenseFormula = activeCampaign?.defenseFormula ?? DEFAULT_DEFENSE_FORMULA;
  const isMasterOfTable = isAdmin || (!!user && activeCampaign?.masterId === user.id);

  useEffect(() => {
    if (character && open) {
      setForm({
        name: character.name,
        life: character.life,
        maxLife: character.maxLife,
        xp: character.xp,
        baseDefense: character.baseDefense ?? 0,
        history: character.history ?? "",
        notes: character.notes ?? "",
        image: character.image ?? "",
        strength: character.strength,
        agility: character.agility,
        vigor: character.vigor,
        intellect: character.intellect,
        presence: character.presence,
        maxReactionsPerRound: character.maxReactionsPerRound ?? "",
        maxAttacksPerRound: character.maxAttacksPerRound ?? "",
        maxTransformationsPerDay: character.maxTransformationsPerDay ?? "",
        sanity: character.sanity ?? "",
        maxSanity: character.maxSanity ?? "",
        abilitySanityCostOverride: character.abilitySanityCostOverride ?? "",
      });
    }
  }, [character, open]);

  const update = (key: string, value: number | string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => {
    setForm(BLANK);
    onClose();
  };

  const currentAttributes = () => ({
    strength: Number(form.strength),
    agility: Number(form.agility),
    vigor: Number(form.vigor),
    intellect: Number(form.intellect),
    presence: Number(form.presence),
  });

  const autoCalculateMaxLife = () => {
    update("maxLife", calculateMaxLife(currentAttributes(), activeCampaign?.maxLifeFormula));
  };

  const autoCalculateDefense = () => {
    update("baseDefense", calculateDefense(currentAttributes(), activeCampaign?.defenseFormula));
  };

  const handleSave = async () => {
    if (Number(form.life) > Number(form.maxLife)) {
      alert("A vida atual não pode ser maior que a vida máxima.");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/characters/${character?.id}`, {
        name: form.name,
        life: Number(form.life),
        maxLife: Number(form.maxLife),
        xp: Number(form.xp),
        baseDefense: Number(form.baseDefense),
        history: String(form.history),
        notes: String(form.notes),
        image: form.image || null,
        strength: Number(form.strength),
        agility: Number(form.agility),
        vigor: Number(form.vigor),
        intellect: Number(form.intellect),
        presence: Number(form.presence),
        ...(isMasterOfTable
          ? {
              maxReactionsPerRound:
                form.maxReactionsPerRound === "" ? null : Number(form.maxReactionsPerRound),
              maxAttacksPerRound:
                form.maxAttacksPerRound === "" ? null : Number(form.maxAttacksPerRound),
              maxTransformationsPerDay:
                form.maxTransformationsPerDay === "" ? null : Number(form.maxTransformationsPerDay),
              sanity: form.sanity === "" ? null : Number(form.sanity),
              maxSanity: form.maxSanity === "" ? null : Number(form.maxSanity),
              abilitySanityCostOverride:
                form.abilitySanityCostOverride === "" ? null : Number(form.abilitySanityCostOverride),
            }
          : {}),
      });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => { if (reason !== "backdropClick") handleClose(); }}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: "#12121e" } }}
    >
      <DialogTitle>Editar Dados do Personagem</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>

          {/* Identificação */}
          <SectionLabel>Identificação</SectionLabel>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Avatar
              src={characterImageSrc(form.image)}
              sx={{ width: 64, height: 64, mt: 1, flexShrink: 0 }}
            >
              {form.name?.[0]?.toUpperCase()}
            </Avatar>
            <Stack spacing={2} flex={1}>
              <TextField
                label="Nome"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                fullWidth
              />
            </Stack>
          </Stack>

          {/* Seletor de imagem — admin ou mestre da mesa */}
          {isMasterOfTable && (
            <ImagePicker
              value={form.image}
              onChange={(filename) => update("image", filename)}
            />
          )}

          <Divider />

          {/* Vida */}
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <SectionLabel>Vida</SectionLabel>
              <Button
                size="small"
                variant="outlined"
                onClick={autoCalculateMaxLife}
                sx={{ textTransform: "none", fontSize: "0.75rem" }}
              >
                Auto: {maxLifeFormula}
              </Button>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Vida Atual"
                type="number"
                value={form.life}
                onChange={(e) => update("life", e.target.value)}
                fullWidth
              />
              <TextField
                label="Vida Máxima"
                type="number"
                value={form.maxLife}
                onChange={(e) => update("maxLife", e.target.value)}
                fullWidth
              />
            </Stack>
          </Box>

          <Divider />

          {/* Defesa e XP */}
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <SectionLabel>Defesa</SectionLabel>
              <Button
                size="small"
                variant="outlined"
                onClick={autoCalculateDefense}
                sx={{ textTransform: "none", fontSize: "0.75rem" }}
              >
                Auto: {defenseFormula}
              </Button>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Defesa Base"
                type="number"
                value={form.baseDefense}
                onChange={(e) => update("baseDefense", e.target.value)}
                fullWidth
              />
              <TextField
                label="XP"
                type="number"
                value={form.xp}
                onChange={(e) => update("xp", e.target.value)}
                fullWidth
                inputProps={{ min: 0 }}
              />
            </Stack>
          </Box>

          <Divider />

          {/* Atributos */}
          <SectionLabel>Atributos</SectionLabel>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Força"
              type="number"
              value={form.strength}
              onChange={(e) => update("strength", e.target.value)}
            />
            <TextField
              label="Agilidade"
              type="number"
              value={form.agility}
              onChange={(e) => update("agility", e.target.value)}
            />
            <TextField
              label="Vigor"
              type="number"
              value={form.vigor}
              onChange={(e) => update("vigor", e.target.value)}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Intelecto"
              type="number"
              value={form.intellect}
              onChange={(e) => update("intellect", e.target.value)}
            />
            <TextField
              label="Presença"
              type="number"
              value={form.presence}
              onChange={(e) => update("presence", e.target.value)}
            />
          </Stack>

          {/* Limites por rodada — apenas mestre/admin */}
          {isMasterOfTable && (
            <>
              <Divider />
              <SectionLabel>Limites por rodada (habilidades deste personagem)</SectionLabel>
              <Typography variant="caption" color="text.secondary">
                Ataque extra e reações além da regra da mesa
                {activeCampaign
                  ? ` (mesa: ${activeCampaign.reactionsPerRound == null ? "reações ilimitadas" : `${activeCampaign.reactionsPerRound} reação(ões)`} / todos começam com 1 ataque)`
                  : ""}
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  select
                  label="Reações por rodada"
                  value={form.maxReactionsPerRound}
                  onChange={(e) => update("maxReactionsPerRound", e.target.value)}
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="">Usa a regra da mesa</MenuItem>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <MenuItem key={n} value={n}>{n}</MenuItem>
                  ))}
                </TextField>
                {/* O limite de transformações vale pela ficha principal (não pela forma) */}
                {!character?.primaryFormId && (
                  <TextField
                    select
                    label="Transformações por dia"
                    value={form.maxTransformationsPerDay}
                    onChange={(e) => update("maxTransformationsPerDay", e.target.value)}
                    fullWidth
                    SelectProps={{ displayEmpty: true }}
                    InputLabelProps={{ shrink: true }}
                    helperText="Voltar à forma base não consome"
                  >
                    <MenuItem value="">Ilimitadas</MenuItem>
                    {[1, 2, 3].map((n) => (
                      <MenuItem key={n} value={n}>{n}</MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  select
                  label="Ataques por rodada"
                  value={form.maxAttacksPerRound}
                  onChange={(e) => update("maxAttacksPerRound", e.target.value)}
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="">Padrão (1 ataque)</MenuItem>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <MenuItem key={n} value={n}>{n}</MenuItem>
                  ))}
                </TextField>
              </Stack>

              <Divider />
              <SectionLabel>Sanidade (só o mestre vê)</SectionLabel>
              <Typography variant="caption" color="text.secondary">
                Jogadores nunca veem estes dois campos — em nenhuma tela. Deixe em branco para não rastrear sanidade neste personagem.
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Sanidade atual"
                  type="number"
                  value={form.sanity}
                  onChange={(e) => update("sanity", e.target.value)}
                  fullWidth
                  inputProps={{ min: 0 }}
                />
                <TextField
                  label="Sanidade máxima"
                  type="number"
                  value={form.maxSanity}
                  onChange={(e) => update("maxSanity", e.target.value)}
                  fullWidth
                  inputProps={{ min: 0 }}
                />
              </Stack>
              <TextField
                label="Custo de sanidade por habilidade (substitui o da mesa)"
                type="number"
                value={form.abilitySanityCostOverride}
                onChange={(e) => update("abilitySanityCostOverride", e.target.value)}
                fullWidth
                inputProps={{ min: 0 }}
                helperText={
                  activeCampaign?.abilitySanityCost != null
                    ? `Vazio = usa o da mesa (${activeCampaign.abilitySanityCost})`
                    : "Vazio = usa o da mesa (sem custo automático configurado)"
                }
              />
            </>
          )}

          <Divider />

          {/* Texto */}
          <SectionLabel>Texto livre</SectionLabel>
          <TextField
            multiline
            rows={8}
            label="História"
            value={form.history}
            onChange={(e) => update("history", e.target.value)}
            fullWidth
          />
          <TextField
            multiline
            rows={6}
            label="Anotações"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} color="inherit" disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!form.name.trim() || saving}
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
