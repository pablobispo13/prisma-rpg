"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useCampaign } from "../../context/CampaignContext";
import { ImagePicker } from "./ImagePicker";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Id do personagem PRINCIPAL que receberá a forma */
  primaryId: string;
  characterName: string;
  onCreated?: () => void;
};

export function FormCreateDialog({ open, onClose, primaryId, characterName, onCreated }: Props) {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const isMasterOfTable = !!user?.isAdmin || (!!user && activeCampaign?.masterId === user.id);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setImage("");
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await api.post(`/characters/${primaryId}/forms`, {
        name: name.trim(),
        ...(image ? { image } : {}),
      });
      toast.success(`Forma "${name.trim()}" criada — ative-a na ficha para editar`);
      onCreated?.();
      onClose();
    } catch {
      // interceptor já exibe o erro
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>🜂 Nova forma para {characterName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <Typography variant="caption" color="text.secondary">
            A forma nasce como cópia completa da ficha atual (atributos, vida e
            ações) e depois pode ser editada de forma independente.
          </Typography>
          <TextField
            label="Nome da forma"
            placeholder="Ex: Zumbi Transformado"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            fullWidth
            autoFocus
          />
          {isMasterOfTable && (
            <ImagePicker value={image} onChange={(filename) => setImage(filename)} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim() || saving}>
          {saving ? "Criando…" : "Criar forma"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
