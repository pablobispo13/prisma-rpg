"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Stack,
  Box,
} from "@mui/material";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Character, Character_Attributes } from "../../types/types";
import { useCampaign } from "../../context/CampaignContext";

type Props = {
  open: boolean;
  character: Character | null;
  onClose: () => void;
  // Após salvar os bônus (recarrega o personagem)
  onSaved?: () => void;
};

/**
 * Modal de atribuição de pontos de perícia (mesmo padrão de
 * CharacterNotesModal): lista todas as perícias da mesa, agrupadas pelo
 * atributo base, com o bônus do personagem em cada. 0 = não possui — a
 * perícia some dos testes rápidos da ficha (SkillsCard).
 */
export function CharacterSkillsModal({ open, character, onClose, onSaved }: Props) {
  const { activeCampaign } = useCampaign();
  const campaignSkills = activeCampaign?.skills ?? [];
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && character) {
      const skills = activeCampaign?.skills ?? [];
      setValues(Object.fromEntries(skills.map((s) => [s.key, character.skills?.[s.key] ?? 0])));
    }
  }, [open, character, activeCampaign]);

  const handleSave = async () => {
    if (!character) return;
    setSaving(true);
    try {
      await api.put(`/characters/${character.id}`, {
        skills: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v) || 0])),
      });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { bgcolor: "#12121e" } }}>
      <DialogTitle>Perícias — {character?.name}</DialogTitle>
      <DialogContent>
        {campaignSkills.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Nenhuma perícia cadastrada na mesa — o mestre pode criar em Minhas Mesas → Editar mesa.
          </Typography>
        ) : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Bônus somado ao atributo base no teste (1d20 + atributo + bônus). Deixe 0 nas perícias que o
              personagem não possui — elas não aparecem nos testes rápidos da ficha.
            </Typography>
            {Character_Attributes.map(({ key, label }) => {
              const group = campaignSkills.filter((s) => s.baseAttribute === key.toUpperCase());
              if (group.length === 0) return null;
              return (
                <Box key={key}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary">
                    {label}
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap mt={1}>
                    {group.map((skill) => (
                      <TextField
                        key={skill.id}
                        label={skill.label}
                        type="number"
                        size="small"
                        value={values[skill.key] ?? 0}
                        onChange={(e) => setValues((prev) => ({ ...prev, [skill.key]: e.target.value }))}
                        sx={{ width: 130 }}
                      />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancelar
        </Button>
        {campaignSkills.length > 0 && (
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
