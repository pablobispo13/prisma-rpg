"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Character } from "../../types/types";

type Field = "history" | "notes";

type Props = {
  open: boolean;
  field: Field;
  character: Character | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const FIELD_LABEL: Record<Field, string> = {
  history: "História",
  notes: "Anotações",
};

const FIELD_EMPTY: Record<Field, string> = {
  history: "Sem história registrada.",
  notes: "Sem anotações.",
};

/**
 * Modal dedicada para ler (e opcionalmente editar) SÓ a história OU SÓ as
 * anotações do personagem, por completo, sem precisar abrir a ficha inteira
 * de edição e rolar até o fim — CharacterHeaderCard só mostra um trecho
 * truncado de cada campo.
 */
export function CharacterNotesModal({ open, field, character, canEdit, onClose, onSaved }: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && character) {
      setValue(character[field] ?? "");
    }
  }, [open, character, field]);

  const handleSave = async () => {
    if (!character) return;
    setSaving(true);
    try {
      await api.put(`/characters/${character.id}`, { [field]: value });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { bgcolor: "#12121e", height: "80vh" } }}>
      <DialogTitle>{FIELD_LABEL[field]} — {character?.name}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column" }}>
        {canEdit ? (
          <TextField
            label={FIELD_LABEL[field]}
            multiline
            value={value}
            onChange={(e) => setValue(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 0.5, flex: 1, display: "flex", "& .MuiInputBase-root": { flex: 1, alignItems: "flex-start" } }}
          />
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
            {character?.[field] || FIELD_EMPTY[field]}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          {canEdit ? "Cancelar" : "Fechar"}
        </Button>
        {canEdit && (
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
