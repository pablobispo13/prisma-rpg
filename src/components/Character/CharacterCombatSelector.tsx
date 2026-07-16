"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  Paper,
  Checkbox,
  Chip,
  TextField,
  InputAdornment,
  Avatar,
  Divider,
  CircularProgress,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useState } from "react";
import { useCombat } from "../../context/CombatContext";
import { characterImageSrc } from "../../lib/characterImage";

type SelectableCharacter = {
  id: string;
  name: string;
  image?: string | null;
  life?: number;
  maxLife?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  players: SelectableCharacter[];
  enemies: SelectableCharacter[];
  onRefresh?: () => Promise<void> | void;
  onCombatCreated: (combat: { id: string }) => void;
};

export default function CharacterCombatSelector({
  open,
  players,
  enemies,
  onClose,
  onRefresh,
  onCombatCreated,
}: Props) {
  const { startCombat } = useCombat();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Sempre que abrir: zera seleção/busca e recarrega a lista de personagens
  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setSearch("");
    if (onRefresh) {
      setRefreshing(true);
      Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const matches = (c: SelectableCharacter) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase());
  const filteredPlayers = players.filter(matches);
  const filteredEnemies = enemies.filter(matches);

  const allPlayersSelected =
    players.length > 0 && players.every((p) => selectedIds.includes(p.id));

  const toggleAllPlayers = () => {
    setSelectedIds((prev) => {
      const others = prev.filter((id) => !players.some((p) => p.id === id));
      return allPlayersSelected ? others : [...others, ...players.map((p) => p.id)];
    });
  };

  const confirm = async () => {
    if (selectedIds.length === 0) return;

    try {
      setLoading(true);

      await startCombat(selectedIds);

      setSelectedIds([]);
      onClose();

      onCombatCreated({ id: "" });
    } finally {
      setLoading(false);
    }
  };

  const renderRow = (c: SelectableCharacter) => {
    const selected = selectedIds.includes(c.id);
    return (
      <Paper
        key={c.id}
        onClick={() => toggle(c.id)}
        sx={{
          p: 1,
          pl: 1.5,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          border: selected ? "2px solid #4fc3f7" : "1px solid #333",
          backgroundColor: selected ? "#1e2a3a" : "transparent",
          transition: "all .15s ease",
        }}
      >
        <Avatar
          src={characterImageSrc(c.image)}
          sx={{ width: 30, height: 30, fontSize: 13 }}
        >
          {c.name[0]?.toUpperCase()}
        </Avatar>
        <Stack flex={1} minWidth={0}>
          <Typography noWrap>{c.name}</Typography>
          {c.maxLife != null && (
            <Typography variant="caption" color="text.secondary">
              HP {c.life ?? c.maxLife}/{c.maxLife}
            </Typography>
          )}
        </Stack>
        <Checkbox checked={selected} sx={{ p: 0.5 }} />
      </Paper>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={(event, reason) => {
        if (reason !== "backdropClick") onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h6">Criar Combate</Typography>
          <Chip
            label={`${selectedIds.length} selecionado(s)`}
            color={selectedIds.length > 0 ? "primary" : "default"}
            size="small"
          />
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" mb={2}>
          <TextField
            size="small"
            fullWidth
            placeholder="Buscar personagem…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: "#555" }} />
                </InputAdornment>
              ),
            }}
          />
          {refreshing && <CircularProgress size={18} />}
        </Stack>

        {/* JOGADORES */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
          <Typography variant="caption" fontWeight={700} sx={{ color: "#8B9DFF", letterSpacing: 1 }}>
            👥 JOGADORES ({filteredPlayers.length})
          </Typography>
          {players.length > 0 && (
            <Button size="small" onClick={toggleAllPlayers} sx={{ fontSize: 11, textTransform: "none" }}>
              {allPlayersSelected ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          )}
        </Stack>
        <Stack spacing={0.75} mb={2}>
          {filteredPlayers.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              Nenhum jogador{search ? " encontrado" : " cadastrado"}.
            </Typography>
          ) : (
            filteredPlayers.map(renderRow)
          )}
        </Stack>

        <Divider sx={{ mb: 1.5, borderColor: "rgba(255,255,255,0.08)" }} />

        {/* INIMIGOS */}
        <Typography variant="caption" fontWeight={700} display="block" mb={0.75} sx={{ color: "#f87171", letterSpacing: 1 }}>
          ⚔️ INIMIGOS / NPCs ({filteredEnemies.length})
        </Typography>
        <Stack spacing={0.75}>
          {filteredEnemies.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              Nenhum inimigo{search ? " encontrado" : " visível"}. Inimigos ocultos não aparecem aqui.
            </Typography>
          ) : (
            filteredEnemies.map(renderRow)
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={selectedIds.length === 0 || loading}
          onClick={confirm}
        >
          {loading ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
          Criar combate
        </Button>
      </DialogActions>
    </Dialog>
  );
}
