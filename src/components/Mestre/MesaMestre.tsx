"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Stack,
  Button,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  CardActions,
  Box,
  TextField,
  CircularProgress,
  IconButton,
  Collapse,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  MenuItem,
} from "@mui/material";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { toast } from "react-toastify";

import api from "../../lib/api";
import { Character } from "../../types/types";
import { useActiveCombats } from "../../lib/useActiveCombats";
import { useCampaign } from "../../context/CampaignContext";
import { useScreenShareContext } from "../../context/ScreenShareContext";
import { isNpc } from "../../lib/isNpc";
import { createCharacterTemplate, Archetype, ARCHETYPE_LABELS } from "../../lib/characterTemplate";
import CharacterCombatSelector from "../Character/CharacterCombatSelector";
import { CombatProvider } from "../../context/CombatContext";
import { CharacterRow } from "../Character/CharacterRow";
import RecentRollsScreen from "../RecentRollsScreen";
import { CombatHistory } from "../Combat/CombatHistory";
import Head from "next/head";

/* =========================
   NEW ENEMY DIALOG
========================= */

const ARCHETYPE_DESCRIPTIONS: Record<Archetype, string> = {
  PLAYER: "Atributos médios (10), 30 HP. Esquiva + bloqueio + contra-ataque (1d6).",
  ENEMY: "Atributos baixos (8), 20 HP. Apenas esquiva.",
  BOSS: "Atributos altos (12-15), 80 HP. Todas as reações, contra-ataque 2d6.",
  MINION: "Atributos mínimos, 8 HP. Sem reações — pra hordas descartáveis.",
  NPC: "Atributos baixos, 10 HP. Sem reações — coadjuvante de cena.",
};

function NewEnemyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState<Archetype>("ENEMY");
  const [creating, setCreating] = useState(false);

  function handleClose() {
    if (!creating) {
      setName("");
      setArchetype("ENEMY");
      onClose();
    }
  }

  async function handleCreate() {
    const trimmed = name.trim() || ARCHETYPE_LABELS[archetype];
    setCreating(true);
    try {
      await createCharacterTemplate(trimmed, archetype);
      toast.success(`"${trimmed}" criado`);
      setName("");
      setArchetype("ENEMY");
      onCreated();
      onClose();
    } catch {
      // toast tratado pelo interceptor
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Novo personagem (mestre)</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={0.5}>
          <TextField
            select
            label="Arquétipo"
            value={archetype}
            onChange={(e) => setArchetype(e.target.value as Archetype)}
            fullWidth
            size="small"
            disabled={creating}
          >
            {(Object.keys(ARCHETYPE_LABELS) as Archetype[]).map((a) => (
              <MenuItem key={a} value={a}>{ARCHETYPE_LABELS[a]}</MenuItem>
            ))}
          </TextField>
          <Typography fontSize={11} color="#888" sx={{ mt: -1, mb: 0 }}>
            {ARCHETYPE_DESCRIPTIONS[archetype]}
          </Typography>
          <TextField
            label="Nome"
            placeholder={`ex: Goblin Guerreiro (default: ${ARCHETYPE_LABELS[archetype]})`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            fullWidth
            size="small"
            disabled={creating}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disabled={creating}>Cancelar</Button>
        <Button variant="contained" onClick={handleCreate} disabled={creating}>
          {creating ? <CircularProgress size={14} sx={{ mr: 0.75 }} /> : null}
          Criar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* =========================
   SECTION HEADER
========================= */

function SectionHeader({
  title,
  count,
  open,
  onToggle,
  actions,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        flex={1}
        onClick={onToggle}
        sx={{ cursor: "pointer", userSelect: "none" }}
      >
        <Typography fontWeight={700} fontSize={14}>
          {title}
        </Typography>
        <Chip
          label={count}
          size="small"
          sx={{ fontSize: 11, height: 18, bgcolor: "rgba(255,255,255,0.07)", color: "#888" }}
        />
        <IconButton
          size="small"
          sx={{
            color: "#555",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            ml: "auto !important",
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Stack>
      {actions && (
        <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/* =========================
   MAIN COMPONENT
========================= */

export default function MesaMestre() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [openSelector, setOpenSelector] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const { combats, reload: reloadCombats } = useActiveCombats();
  const { activeCampaign } = useCampaign();
  const masterId = activeCampaign?.masterId ?? null;

  const { sharing: screenSharing, viewerCount: screenShareViewerCount, error: screenShareError, start: startScreenShare, stop: stopScreenShare } = useScreenShareContext();

  // Character sections
  const [playersOpen, setPlayersOpen] = useState(true);
  const [enemiesOpen, setEnemiesOpen] = useState(true);
  const [enemySearch, setEnemySearch] = useState("");
  const [newEnemyOpen, setNewEnemyOpen] = useState(false);

  // Enemy visibility & ordering (persisted in localStorage)
  const [hiddenEnemyIds, setHiddenEnemyIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("mesa_hidden_enemies") ?? "[]"); } catch { return []; }
  });
  const [enemyOrder, setEnemyOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("mesa_enemy_order") ?? "[]"); } catch { return []; }
  });
  const [showHidden, setShowHidden] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchCharacters = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get("/characters");
      setCharacters(res.data.characters || []);
    } catch {
      toast.error("Erro ao buscar personagens");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchCharacters();
  }, [token]);

  useEffect(() => {
    localStorage.setItem("mesa_hidden_enemies", JSON.stringify(hiddenEnemyIds));
  }, [hiddenEnemyIds]);

  useEffect(() => {
    localStorage.setItem("mesa_enemy_order", JSON.stringify(enemyOrder));
  }, [enemyOrder]);

  const players = characters.filter((c) => !isNpc(c, masterId));
  const enemies = characters.filter((c) => isNpc(c, masterId));

  const sortedEnemies = [...enemies].sort((a, b) => {
    const ai = enemyOrder.indexOf(a.id);
    const bi = enemyOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const hiddenCount = enemies.filter((e) => hiddenEnemyIds.includes(e.id)).length;
  const isSearching = enemySearch.trim().length > 0;

  const baseEnemies = isSearching || showHidden
    ? sortedEnemies
    : sortedEnemies.filter((c) => !hiddenEnemyIds.includes(c.id));

  const filteredEnemies = isSearching
    ? baseEnemies.filter((c) => c.name.toLowerCase().includes(enemySearch.toLowerCase()))
    : baseEnemies;

  const visibleInList = isSearching ? filteredEnemies : filteredEnemies.filter((c) => !hiddenEnemyIds.includes(c.id));
  const hiddenInList = !isSearching && showHidden ? filteredEnemies.filter((c) => hiddenEnemyIds.includes(c.id)) : [];

  function handleDragStart(id: string) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = "move";
    };
  }

  function handleDragOver(id: string) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverId !== id) setDragOverId(id);
    };
  }

  function handleDrop(targetId: string) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
      const currentIds = sortedEnemies.map((en) => en.id);
      const newOrder = [...currentIds];
      const fromIdx = newOrder.indexOf(draggedId);
      const toIdx = newOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedId);
      setEnemyOrder(newOrder);
      setDraggedId(null);
      setDragOverId(null);
    };
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function toggleHide(id: string) {
    setHiddenEnemyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function openSheet(char: Character) {
    window.open(`/protected?view=jogador&characterId=${char.id}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 380px",
        gap: 2,
        height: "100vh",
        overflow: "hidden",
        background: "#0e0e1a",
      }}
    >
      <Head>
        <title>Mesa Mestre</title>
      </Head>

      {/* ─── COLUNA PRINCIPAL ─── */}
      <Box sx={{ overflow: "auto", pr: 1 }}>
        <Stack gap={2}>

          {/* COMPARTILHAMENTO DE TELA */}
          <Paper elevation={6} sx={{
            p: 2,
            background: "linear-gradient(135deg, rgba(28,28,46,0.6) 0%, rgba(14,14,26,0.9) 100%)",
            border: `1px solid ${screenSharing ? "rgba(107,219,122,0.4)" : "rgba(107,122,219,0.2)"}`,
            transition: "border-color 0.3s",
          }}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <LiveTvIcon sx={{ color: screenSharing ? "#4ade80" : "#6B7ADB", flexShrink: 0 }} />
              <Typography fontWeight={600} sx={{ color: screenSharing ? "#4ade80" : "#8B9DFF", flex: 1 }}>
                {screenSharing
                  ? `Compartilhando tela (${screenShareViewerCount} assistindo)`
                  : "Compartilhamento de tela"}
              </Typography>
              {screenShareError && (
                <Typography fontSize={12} color="#f87171">{screenShareError}</Typography>
              )}
              <Button
                variant={screenSharing ? "outlined" : "contained"}
                color={screenSharing ? "error" : "primary"}
                size="small"
                onClick={screenSharing ? stopScreenShare : startScreenShare}
                sx={{ minWidth: 140, flexShrink: 0 }}
              >
                {screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
              </Button>
            </Stack>
          </Paper>

          {/* COMBATES ATIVOS */}
          <Paper elevation={6} sx={{
            p: 3,
            background: "linear-gradient(135deg, rgba(28,28,46,0.6) 0%, rgba(14,14,26,0.9) 100%)",
            border: "1px solid rgba(107,122,219,0.2)",
          }}>
            <Stack gap={3}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h5" fontWeight="bold" sx={{ fontSize: "1.3rem", letterSpacing: 0.5 }}>
                  ⚔️ Combates Ativos
                </Typography>
                <Button variant="contained" color="primary" onClick={() => setOpenSelector(true)}>
                  Criar combate
                </Button>
              </Stack>

              {combats.length === 0 ? (
                <Typography color="text.secondary">Nenhum combate ativo no momento.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {combats.map((c) => (
                    <Grid container key={c.id}>
                      <Card sx={{
                        height: "100%",
                        background: "linear-gradient(135deg, rgba(42,42,85,0.5) 0%, rgba(28,28,46,0.7) 100%)",
                        border: "2px solid rgba(79,195,247,0.3)",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        cursor: "pointer",
                        "&:hover": { border: "2px solid rgba(79,195,247,0.8)", boxShadow: "0 0 20px rgba(79,195,247,0.4)", transform: "translateY(-4px)" },
                      }}>
                        <CardContent>
                          <Stack gap={1}>
                            <Typography variant="h6" fontWeight="bold">{`Combate #${c.id.slice(0, 8)}`}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.85rem" }}>ID: {c.id}</Typography>
                            <Chip label="Em andamento" color="success" size="small" sx={{ width: "fit-content", mt: 1 }} />
                          </Stack>
                        </CardContent>
                        <CardActions>
                          <Button
                            fullWidth variant="outlined" endIcon={<OpenInNewIcon />}
                            onClick={() => window.open(`/protected/combat?combatId=${c.id}`, "_blank", "noopener,noreferrer")}
                          >
                            Abrir combate
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Stack>
          </Paper>

          {/* HISTÓRICO */}
          <Paper elevation={6} sx={{
            p: 3,
            background: "linear-gradient(135deg, rgba(28,28,46,0.6) 0%, rgba(14,14,26,0.9) 100%)",
            border: "1px solid rgba(107,122,219,0.2)",
          }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              onClick={() => setHistoryOpen((v) => !v)} sx={{ cursor: "pointer" }}>
              <Typography variant="h5" fontWeight="bold" sx={{ fontSize: "1.3rem", letterSpacing: 0.5 }}>
                <HistoryIcon sx={{ fontSize: 20, mr: 1, verticalAlign: "middle" }} />
                Histórico de Combates
              </Typography>
              <Typography fontSize={12} color="#888">{historyOpen ? "Ocultar" : "Mostrar"}</Typography>
            </Stack>
            {historyOpen && <Box mt={2}><CombatHistory /></Box>}
          </Paper>

          {/* ─── PERSONAGENS ─── */}
          <Paper elevation={6} sx={{
            p: 3,
            background: "linear-gradient(135deg, rgba(28,28,46,0.6) 0%, rgba(14,14,26,0.9) 100%)",
            border: "1px solid rgba(107,122,219,0.2)",
          }}>
            <Stack spacing={3}>

              {/* ── JOGADORES ── */}
              <Box>
                <SectionHeader
                  title="👥 Jogadores"
                  count={players.length}
                  open={playersOpen}
                  onToggle={() => setPlayersOpen((v) => !v)}
                />
                <Collapse in={playersOpen} timeout="auto" unmountOnExit>
                  <Stack spacing={0.5} mt={1.5}>
                    {players.length === 0 ? (
                      <Typography fontSize={13} color="#555" sx={{ py: 1 }}>Nenhum jogador cadastrado.</Typography>
                    ) : (
                      players.map((char) => (
                        <CharacterRow
                          key={char.id}
                          character={char}
                          onAccess={() => openSheet(char)}
                          onDelete={() => fetchCharacters()}
                          onFormCreated={() => fetchCharacters()}
                        />
                      ))
                    )}
                  </Stack>
                </Collapse>
              </Box>

              <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />

              {/* ── INIMIGOS / NPCs ── */}
              <Box>
                <SectionHeader
                  title="⚔️ Inimigos / NPCs"
                  count={enemies.length}
                  open={enemiesOpen}
                  onToggle={() => setEnemiesOpen((v) => !v)}
                  actions={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {hiddenCount > 0 && (
                        <Chip
                          size="small"
                          label={`${hiddenCount} oculto${hiddenCount !== 1 ? "s" : ""}`}
                          onClick={() => setShowHidden((v) => !v)}
                          sx={{
                            fontSize: 11,
                            height: 22,
                            cursor: "pointer",
                            bgcolor: showHidden ? "rgba(107,122,219,0.18)" : "rgba(255,255,255,0.05)",
                            color: showHidden ? "#8B9DFF" : "#555",
                            border: `1px solid ${showHidden ? "rgba(107,122,219,0.4)" : "transparent"}`,
                            "&:hover": { bgcolor: showHidden ? "rgba(107,122,219,0.28)" : "rgba(255,255,255,0.09)" },
                          }}
                        />
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PersonAddIcon />}
                        onClick={() => setNewEnemyOpen(true)}
                        sx={{ fontSize: 12, py: 0.4 }}
                      >
                        Novo inimigo
                      </Button>
                    </Stack>
                  }
                />

                <Collapse in={enemiesOpen} timeout="auto" unmountOnExit>
                  <Box mt={1.5}>
                    {/* Search */}
                    {enemies.length > 4 && (
                      <TextField
                        size="small"
                        placeholder="Buscar inimigo…"
                        value={enemySearch}
                        onChange={(e) => setEnemySearch(e.target.value)}
                        fullWidth
                        sx={{ mb: 1, "& .MuiInputBase-input": { fontSize: 12 } }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchIcon sx={{ fontSize: 16, color: "#555" }} />
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}

                    <Stack spacing={0.5}>
                      {visibleInList.length === 0 && hiddenInList.length === 0 ? (
                        <Typography fontSize={13} color="#555" sx={{ py: 1 }}>
                          {isSearching ? "Nenhum inimigo encontrado." : "Nenhum inimigo cadastrado."}
                        </Typography>
                      ) : (
                        visibleInList.map((char) => (
                          <CharacterRow
                            key={char.id}
                            character={char}
                            onAccess={() => openSheet(char)}
                            onDelete={() => {
                              setHiddenEnemyIds((prev) => prev.filter((id) => id !== char.id));
                              setEnemyOrder((prev) => prev.filter((id) => id !== char.id));
                              fetchCharacters();
                            }}
                            onClone={() => fetchCharacters()}
                            onFormCreated={() => fetchCharacters()}
                            onHide={() => toggleHide(char.id)}
                            isHidden={false}
                            onDragStart={!isSearching ? handleDragStart(char.id) : undefined}
                            onDragOver={!isSearching ? handleDragOver(char.id) : undefined}
                            onDrop={!isSearching ? handleDrop(char.id) : undefined}
                            onDragEnd={!isSearching ? handleDragEnd : undefined}
                            isDragOver={!isSearching && dragOverId === char.id}
                          />
                        ))
                      )}
                    </Stack>

                    {/* Hidden enemies (shown when toggle is active) */}
                    {hiddenInList.length > 0 && (
                      <>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.75 }}>
                          <Divider sx={{ flex: 1, borderColor: "rgba(255,255,255,0.05)" }} />
                          <Typography fontSize={10} color="#333" sx={{ textTransform: "uppercase", letterSpacing: 1 }}>ocultos</Typography>
                          <Divider sx={{ flex: 1, borderColor: "rgba(255,255,255,0.05)" }} />
                        </Stack>
                        <Stack spacing={0.5}>
                          {hiddenInList.map((char) => (
                            <CharacterRow
                              key={char.id}
                              character={char}
                              onAccess={() => openSheet(char)}
                              onDelete={() => {
                                setHiddenEnemyIds((prev) => prev.filter((id) => id !== char.id));
                                setEnemyOrder((prev) => prev.filter((id) => id !== char.id));
                                fetchCharacters();
                              }}
                              onClone={() => fetchCharacters()}
                              onFormCreated={() => fetchCharacters()}
                              onHide={() => toggleHide(char.id)}
                              isHidden={true}
                              onDragStart={handleDragStart(char.id)}
                              onDragOver={handleDragOver(char.id)}
                              onDrop={handleDrop(char.id)}
                              onDragEnd={handleDragEnd}
                              isDragOver={dragOverId === char.id}
                            />
                          ))}
                        </Stack>
                      </>
                    )}

                    {isSearching && filteredEnemies.length > 0 && enemies.length !== filteredEnemies.length && (
                      <Typography fontSize={11} color="#555" mt={1}>
                        {filteredEnemies.length} de {enemies.length} inimigos
                      </Typography>
                    )}
                    {!isSearching && !showHidden && (
                      <Typography fontSize={10} color="#2a2a3a" mt={0.75}>
                        Arraste para reordenar
                      </Typography>
                    )}
                  </Box>
                </Collapse>
              </Box>

            </Stack>
          </Paper>

          {/* Combat selector — inimigos ocultos ficam de fora */}
          <CombatProvider combatId={undefined}>
            <CharacterCombatSelector
              open={openSelector}
              onClose={() => setOpenSelector(false)}
              players={players}
              enemies={sortedEnemies.filter((c) => !hiddenEnemyIds.includes(c.id))}
              onRefresh={fetchCharacters}
              onCombatCreated={() => reloadCombats()}
            />
          </CombatProvider>

        </Stack>
      </Box>

      {/* ─── COLUNA LATERAL ─── */}
      <Box sx={{
        borderLeft: "1px solid rgba(107,122,219,0.2)",
        backgroundColor: "rgba(14,14,26,0.8)",
        p: 2,
        overflow: "auto",
        background: "linear-gradient(135deg, rgba(28,28,46,0.6) 0%, rgba(14,14,26,0.9) 100%)",
      }}>
        <RecentRollsScreen />
      </Box>

      {/* New enemy dialog */}
      <NewEnemyDialog
        open={newEnemyOpen}
        onClose={() => setNewEnemyOpen(false)}
        onCreated={fetchCharacters}
      />
    </Box>
  );
}
