"use client";

import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  Button,
  LinearProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  IconButton,
  TextField,
  Tooltip,
  Avatar,
} from "@mui/material";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import { useCombat, CombatProvider } from "../../context/CombatContext";
import api from "../../lib/api";
import { useRouter } from "next/router";
import { ActionPresetType } from "../../types/types";
import { previewFormulaVariables, buildAttributeValueMap, formulaReferencesAttribute } from "../../lib/presetUtils";
import { CombatTimelineV2 } from "../Log/CombatTimelineV2";
import { DiceInputRoller } from "../DiceInputRoller";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useScreenShareContext } from "../../context/ScreenShareContext";
import { characterImageSrc } from "../../lib/characterImage";
import { useCampaign } from "../../context/CampaignContext";
import { isNpc as checkIsNpc } from "../../lib/isNpc";
import { Reorder, motion, AnimatePresence } from "framer-motion";

/* =========================
   HELPERS
========================= */

type HpTier = { label: string; color: string; bgColor: string };

const EFFECT_META: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  STAT_BUFF:       { icon: "↑", label: "Buff",        color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  STAT_DEBUFF:     { icon: "↓", label: "Debuff",      color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  DEFENSE_BUFF:    { icon: "🛡↑", label: "Defesa +",   color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  DEFENSE_DEBUFF:  { icon: "🛡↓", label: "Defesa −",   color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  ROLL_BONUS:      { icon: "+", label: "Bônus",       color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  ROLL_PENALTY:    { icon: "−", label: "Penalidade",  color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  STUN:            { icon: "💫", label: "Atordoado",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  HEAL_OVER_TIME:  { icon: "♥", label: "Regen",       color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  DAMAGE_OVER_TIME:{ icon: "☠", label: "DoT",         color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  CONTROLLED:      { icon: "🧠", label: "Controlado",  color: "#c084fc", bg: "rgba(192,132,252,0.14)" },
  DAMAGE_TAKEN_BONUS: { icon: "🎯", label: "Marcado",  color: "#fb7185", bg: "rgba(251,113,133,0.14)" },
};

const ATTR_SHORT: Record<string, string> = {
  STRENGTH: "FOR", AGILITY: "AGI", VIGOR: "VIG", INTELLECT: "INT", PRESENCE: "PRE",
};

function HpBar({ current, max, tempHp, height = 7 }: { current: number; max: number; tempHp?: number; height?: number }) {
  const tier = getHpTier(current, max);
  const hpPct  = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const tmpPct = (max > 0 && (tempHp ?? 0) > 0)
    ? Math.min(100 - hpPct, ((tempHp ?? 0) / max) * 100)
    : 0;

  return (
    <Box sx={{ height, borderRadius: height / 2, bgcolor: "#2a2a3a", position: "relative", overflow: "hidden" }}>
      {/* Rastro de dano: barra fantasma que encolhe com atraso, mostrando o HP perdido */}
      <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${hpPct}%`, bgcolor: "#fca5a5", opacity: 0.75, transition: "width 0.9s ease 0.45s" }} />
      <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${hpPct}%`, bgcolor: tier.color, transition: "width 0.35s ease" }} />
      {tmpPct > 0 && (
        <Box sx={{ position: "absolute", left: `${hpPct}%`, top: 0, bottom: 0, width: `${tmpPct}%`, bgcolor: "#60a5fa", transition: "left 0.35s ease, width 0.6s ease", opacity: 0.85 }} />
      )}
    </Box>
  );
}

const EFFECT_SHOWS_STAT  = new Set(["STAT_BUFF", "STAT_DEBUFF"]);
const EFFECT_SHOWS_VALUE = new Set(["STAT_BUFF", "STAT_DEBUFF", "DEFENSE_BUFF", "DEFENSE_DEBUFF", "ROLL_BONUS", "ROLL_PENALTY", "HEAL_OVER_TIME", "DAMAGE_OVER_TIME"]);

function EffectChips({ effects, tempHp }: { effects: any[]; tempHp?: number }) {
  const chips: React.ReactNode[] = [];

  for (const eff of effects ?? []) {
    const meta = EFFECT_META[eff.type] ?? { icon: "?", label: eff.type, color: "#888", bg: "rgba(136,136,136,0.1)" };
    const statSuffix  = EFFECT_SHOWS_STAT.has(eff.type) && eff.statAffected ? ` ${ATTR_SHORT[eff.statAffected] ?? eff.statAffected}` : "";
    const valSuffix   = EFFECT_SHOWS_VALUE.has(eff.type) && eff.value ? ` ${eff.value > 0 ? "+" : ""}${eff.value}` : "";
    const turnsSuffix = eff.remainingTurns > 1 ? ` (${eff.remainingTurns})` : "";
    chips.push(
      <Chip key={eff.id} size="small"
        label={`${meta.icon}${statSuffix}${valSuffix}${turnsSuffix}`}
        title={`${meta.label}${statSuffix}${valSuffix} — ${eff.remainingTurns} turno${eff.remainingTurns !== 1 ? "s" : ""} restante${eff.remainingTurns !== 1 ? "s" : ""}`}
        sx={{ fontSize: 9, height: 16, bgcolor: meta.bg, color: meta.color, border: `1px solid ${meta.color}40` }} />
    );
  }

  if (chips.length === 0) return null;
  return (
    <Stack direction="row" flexWrap="wrap" gap={0.4} mt={0.5}>
      {chips}
    </Stack>
  );
}

function getHpTier(currentLife: number, maxLife: number): HpTier {
  if (currentLife <= 0) return { label: "Morto", color: "#666", bgColor: "#66666620" };
  const pct = maxLife > 0 ? currentLife / maxLife : 0;
  if (pct > 0.75) return { label: "Saudável", color: "#66bb6a", bgColor: "#66bb6a20" };
  if (pct > 0.5) return { label: "Levem. Ferido", color: "#8bc34a", bgColor: "#8bc34a20" };
  if (pct > 0.25) return { label: "Ferido", color: "#ffa726", bgColor: "#ffa72620" };
  return { label: "Crítico", color: "#ef5350", bgColor: "#ef535020" };
}

function parseDiceAverage(formula: string): number {
  if (!formula) return 0;
  let total = 0;
  const withAverages = formula.replace(/(\d+)d(\d+)/gi, (_, n, m) =>
    String(parseInt(n) * (parseInt(m) + 1) / 2)
  );
  const numPattern = /([+-]?\s*\d+(?:\.\d+)?)/g;
  let match;
  while ((match = numPattern.exec(withAverages)) !== null) {
    total += parseFloat(match[1].replace(/\s/g, ""));
  }
  return Math.round(total * 10) / 10;
}

const ATTR_LABEL: Record<string, string> = {
  STRENGTH: "Força",
  AGILITY: "Agilidade",
  VIGOR: "Vigor",
  INTELLECT: "Intelecto",
  PRESENCE: "Presença",
};

function presetTooltipContent(preset: ActionPresetType, attributeValues: Record<string, number>) {
  // Fórmulas com {{atributo}} resolvidas pro valor atual (ex: "8d20") — tanto
  // pra exibir quanto pra calcular a média certa (parseDiceAverage não entende {{}})
  const resolvedDice = previewFormulaVariables(preset.diceFormula, attributeValues);
  const resolvedImpact = preset.impactFormula ? previewFormulaVariables(preset.impactFormula, attributeValues) : null;
  const diceUsesAttribute = formulaReferencesAttribute(preset.diceFormula, preset.attribute);
  const impactUsesAttribute = formulaReferencesAttribute(preset.impactFormula, preset.attribute);

  const avgAttack = parseDiceAverage(resolvedDice);
  const avgDamage = resolvedImpact ? parseDiceAverage(resolvedImpact) : null;
  const avgCrit =
    avgDamage && preset.critMultiplier
      ? Math.round(avgDamage * preset.critMultiplier * 10) / 10
      : null;
  const attrLabel = ATTR_LABEL[preset.attribute] ?? preset.attribute;

  return (
    <Box sx={{ p: 0.5, maxWidth: 260 }}>
      <Typography fontWeight="bold" fontSize={13} mb={0.5}>{preset.name}</Typography>
      {preset.description && (
        <Typography fontSize={11} color="#ccc" mb={1} sx={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>
          {preset.description}
        </Typography>
      )}

      <Divider sx={{ borderColor: "#ffffff20", my: 0.75 }} />

      <Stack spacing={0.4}>
        <Row label="Tipo" value={preset.type} />
        <Row label="Alvo" value={preset.targetType} />
        <Row label="Atributo" value={attrLabel} highlight />

        <Divider sx={{ borderColor: "#ffffff15", my: 0.5 }} />

        <Typography fontSize={11} color="#fbbf24" fontWeight={600}>Rolagem de Ataque</Typography>
        <Row label="Dado" value={`${resolvedDice}  (média ${avgAttack})`} />
        {!!preset.modifier && (
          <Row label="Modificador" value={`${preset.modifier > 0 ? "+" : ""}${preset.modifier}`} />
        )}
        <Row
          label="Total médio"
          value={diceUsesAttribute
            ? `~${avgAttack + (preset.modifier ?? 0)}`
            : `~${avgAttack + (preset.modifier ?? 0)} + ${attrLabel}`}
          highlight
        />

        {avgDamage !== null && (
          <>
            <Divider sx={{ borderColor: "#ffffff15", my: 0.5 }} />
            <Typography fontSize={11} color="#f87171" fontWeight={600}>Impacto</Typography>
            <Row label="Fórmula" value={`${resolvedImpact}  (média ${avgDamage})`} />
            <Row
              label="Dano médio"
              value={impactUsesAttribute ? `~${avgDamage}` : `~${avgDamage} + ${attrLabel}`}
              highlight
            />
            {avgCrit && (
              <Row
                label={`Crítico ×${preset.critMultiplier}`}
                value={impactUsesAttribute ? `~${avgCrit}` : `~${avgCrit} + ${attrLabel}`}
                danger
              />
            )}
          </>
        )}

        {(preset.critThreshold ?? 20) < 20 && (
          <>
            <Divider sx={{ borderColor: "#ffffff15", my: 0.5 }} />
            <Row label="Crítico em" value={`≥ ${preset.critThreshold ?? 20}`} danger />
          </>
        )}

        {preset.usesPerDay != null && (
          <>
            <Divider sx={{ borderColor: "#ffffff15", my: 0.5 }} />
            <Row
              label="Usos hoje"
              value={`${preset.dailyUsages?.[0]?.usedCount ?? 0} / ${preset.usesPerDay}`}
              danger={(preset.dailyUsages?.[0]?.usedCount ?? 0) >= preset.usesPerDay}
            />
          </>
        )}

        <Divider sx={{ borderColor: "#ffffff15", my: 0.5 }} />
        <Typography fontSize={10} color="#9ca3af">
          {preset.requiresTurn ? "⚡ Consome turno" : "✓ Ação livre"}{" "}
          {preset.allowOutOfCombat ? "• ✓ Fora de combate" : ""}{" "}
          {preset.isAreaEffect ? "• 🌐 Área" : ""}
        </Typography>
      </Stack>
    </Box>
  );
}

function transformPresetTooltipContent(
  preset: ActionPresetType,
  isCurrent: boolean,
  transformLimit: number | null,
  transformsLeft: number | null,
) {
  const isRevert = preset.targetFormId == null;

  return (
    <Box sx={{ p: 0.5, maxWidth: 260 }}>
      <Typography fontWeight="bold" fontSize={13} mb={0.5}>{preset.name}</Typography>
      {preset.description && (
        <Typography fontSize={11} color="#ccc" mb={1} sx={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>
          {preset.description}
        </Typography>
      )}

      <Divider sx={{ borderColor: "#ffffff20", my: 0.75 }} />

      <Stack spacing={0.4}>
        {isCurrent && <Row label="Status" value="Forma atual" highlight />}
        {!isRevert && transformLimit != null && (
          <Row
            label="Limite por dia"
            value={`${transformsLeft ?? 0} / ${transformLimit} restantes`}
            danger={(transformsLeft ?? 0) <= 0}
          />
        )}
        {!isRevert && transformLimit == null && <Row label="Limite por dia" value="Ilimitado" />}
        {isRevert && <Row label="Limite por dia" value="Livre — não consome" />}

        <Divider sx={{ borderColor: "#ffffff15", my: 0.5 }} />
        <Typography fontSize={10} color="#9ca3af">
          ✓ Ação livre — não consome o turno
        </Typography>
      </Stack>
    </Box>
  );
}

function Row({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Typography fontSize={11} color="#9ca3af">{label}</Typography>
      <Typography fontSize={11} color={danger ? "#f87171" : highlight ? "#a78bfa" : "#e5e7eb"} fontWeight={highlight || danger ? 600 : 400}>
        {value}
      </Typography>
    </Stack>
  );
}

/* =========================
   ROOT
========================= */

type CombatScreenProps = { combatId: string };

export default function CombatScreen({ combatId }: CombatScreenProps) {
  return (
    <CombatProvider combatId={combatId}>
      <CombatScreenContent />
    </CombatProvider>
  );
}

/* =========================
   CONTENT
========================= */

function CombatScreenContent() {
  const {
    combat, isMaster, isMyTurn, actionUsed, attackLimit, attacksLeft, myCharacterIds, selectedTargets,
    selectTarget, clearTargets, useMainAction, endTurn, endCombat, pendingReactionRoll,
    resolveReaction, refreshCombat,
    isLoading, combatStats, clearStats,
    effectSelectionRequest, confirmEffectSelection, cancelEffectSelection,
  } = useCombat();

  // Escolha de efeito (habilidade CHOOSE_ONE/CHOOSE_ANY)
  const [chosenEffectIds, setChosenEffectIds] = useState<string[]>([]);
  useEffect(() => { setChosenEffectIds([]); }, [effectSelectionRequest?.presetId]);

  // Ajuste manual de sanidade (mestre)
  const [sanityEditOpen, setSanityEditOpen] = useState(false);
  const [sanityEditParticipant, setSanityEditParticipant] = useState<any>(null);
  const [sanityEditValue, setSanityEditValue] = useState<number>(0);

  const router = useRouter();
  const { activeCampaign } = useCampaign();
  const masterId = activeCampaign?.masterId ?? null;

  // Add participant
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [availableChars, setAvailableChars] = useState<any[]>([]);
  const [loadingChars, setLoadingChars] = useState(false);

  // Manual HP edit
  const [hpEditOpen, setHpEditOpen] = useState(false);
  const [hpEditParticipant, setHpEditParticipant] = useState<any>(null);
  const [hpEditValue, setHpEditValue] = useState<number>(0);

  // Vantagem/desvantagem — modificador na PRÓXIMA rolagem do personagem (mestre)
  const [rollModOpen, setRollModOpen] = useState(false);
  const [rollModParticipant, setRollModParticipant] = useState<any>(null);
  const [rollModValue, setRollModValue] = useState<string>("5");

  // Drag-and-drop order
  const [orderedParticipants, setOrderedParticipants] = useState<any[]>([]);
  const draggedRef = useRef(false);

  // Floating damage numbers
  const prevLifeRef = useRef<Record<string, number>>({});
  const prevLogCountRef = useRef<number | null>(null);
  const [floatingDamages, setFloatingDamages] = useState<Record<string, { id: number; delta: number; isHeal: boolean; xJitter: number; big: boolean }[]>>({});

  // Fullscreen battlefield
  const [battleFullscreen, setBattleFullscreen] = useState(false);
  const [fullscreenMuted, setFullscreenMuted] = useState(true);
  const battleVideoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);

  // Armed preset (user must pick an action before selecting targets)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Transformação (troca de forma) em combate — cada forma disponível é um
  // ActionPreset type=TRANSFORM (auto-gerado em POST .../forms)
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    if (actionUsed || !isMyTurn) setSelectedPresetId(null);
  }, [actionUsed, isMyTurn]);

  function handleBattleFullscreen() {
    if (battleVideoRef.current?.requestFullscreen) {
      battleVideoRef.current.requestFullscreen();
    } else {
      setBattleFullscreen(true); // fallback para navegadores sem suporte
    }
  }

  const { active: screenShareActive, stream: screenShareStream } = useScreenShareContext();

  useEffect(() => {
    if (battleVideoRef.current) battleVideoRef.current.srcObject = screenShareStream;
    if (fullscreenVideoRef.current) fullscreenVideoRef.current.srcObject = screenShareStream;
  }, [screenShareStream, battleFullscreen]);

  // Redireciona jogadores automaticamente quando o combate é encerrado
  useEffect(() => {
    if (combat?.active === false && !isMaster) {
      toast.info("O combate foi encerrado pelo mestre.");
      router.push("/protected/");
    }
  }, [combat?.active]);

  /* ---- sync ordered list (skip during active drag to avoid ghost animation) ---- */
  useEffect(() => {
    if (!combat || draggedRef.current) return;
    const sorted = [...combat.participants].sort((a: any, b: any) => a.turnOrder - b.turnOrder);
    setOrderedParticipants(sorted);
  }, [combat?.participants]);

  /* ---- detect HP changes for floating numbers ---- */
  const livesKey = combat?.participants?.map((p: any) => `${p.character.id}:${p.currentLife}`).join(",") ?? "";

  useEffect(() => {
    if (!combat?.participants) return;
    const events: Record<string, { id: number; delta: number; isHeal: boolean; xJitter: number; big: boolean }> = {};

    // Mudança de HP sem nenhum log novo visível = ajuste silencioso do mestre.
    // Para NPCs (HP oculto), jogadores não devem ver o número flutuante nesse caso.
    const visibleLogCount = combat.logs?.length ?? 0;
    const newLogsArrived = prevLogCountRef.current === null || visibleLogCount !== prevLogCountRef.current;

    for (const p of combat.participants as any[]) {
      const prev = prevLifeRef.current[p.character.id];
      if (prev !== undefined && p.currentLife !== prev) {
        const hiddenHp = !isMaster && checkIsNpc(p.character, masterId);
        if (hiddenHp && !newLogsArrived) {
          prevLifeRef.current[p.character.id] = p.currentLife;
          continue;
        }
        const delta = Math.abs(p.currentLife - prev);
        const big = delta >= Math.max(10, (p.character.maxLife ?? 0) * 0.25);
        events[p.character.id] = {
          id: Date.now() + Math.random(),
          delta,
          isHeal: p.currentLife > prev,
          xJitter: Math.round((Math.random() - 0.5) * 28),
          big,
        };
      }
      prevLifeRef.current[p.character.id] = p.currentLife;
    }

    if (Object.keys(events).length === 0) return;

    setFloatingDamages((prev) => {
      const next = { ...prev };
      for (const [charId, ev] of Object.entries(events)) {
        next[charId] = [...(prev[charId] ?? []), ev];
      }
      return next;
    });

    const toRemove = Object.entries(events).map(([charId, ev]) => ({ charId, id: ev.id }));
    setTimeout(() => {
      setFloatingDamages((prev) => {
        const next = { ...prev };
        for (const { charId, id } of toRemove) {
          next[charId] = (prev[charId] ?? []).filter((x) => x.id !== id);
        }
        return next;
      });
    }, 1800);
  }, [livesKey]);

  // Atualiza a contagem de logs visíveis DEPOIS da detecção acima (ordem de declaração)
  useEffect(() => {
    if (combat) prevLogCountRef.current = combat.logs?.length ?? 0;
  }, [combat]);

  /* ---- turn notification ---- */
  useEffect(() => {
    if (!combat) return;
    if (isMyTurn && !pendingReactionRoll) {
      document.title = "⚔️ SEU TURNO! — Combate";
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("É o seu turno!", { body: "Clique para agir no combate." });
        } else if (Notification.permission === "default") {
          Notification.requestPermission();
        }
      }
    } else {
      document.title = "Tela de combate";
    }
    return () => { document.title = "Tela de combate"; };
  }, [isMyTurn, pendingReactionRoll]);

  async function openAddParticipant() {
    setAddParticipantOpen(true);
    setLoadingChars(true);
    try {
      const res = await api.get("/characters");
      const existingIds = new Set(combat?.participants.map((p: any) => p.character.id));
      setAvailableChars((res.data.characters ?? res.data).filter((c: any) => !existingIds.has(c.id)));
    } catch { setAvailableChars([]); }
    finally { setLoadingChars(false); }
  }

  async function addParticipant(characterId: string) {
    await api.post("/combat/participants", { combatId: combat.id, characterId });
    setAddParticipantOpen(false);
    await refreshCombat();
  }

  async function submitHpEdit() {
    if (!hpEditParticipant) return;
    await api.post("/combat/control", {
      action: "adjustHp", combatId: combat.id,
      characterId: hpEditParticipant.character.id, newHp: hpEditValue,
    });
    setHpEditOpen(false);
    setHpEditParticipant(null);
    await refreshCombat();
  }

  async function submitSanityEdit() {
    if (!sanityEditParticipant) return;
    await api.post("/combat/control", {
      action: "adjustSanity", combatId: combat.id,
      characterId: sanityEditParticipant.character.id, newSanity: sanityEditValue,
    });
    setSanityEditOpen(false);
    setSanityEditParticipant(null);
    await refreshCombat();
  }

  async function submitRollModifier(value: number | null) {
    if (!rollModParticipant) return;
    await api.post("/combat/control", {
      action: "setRollModifier", combatId: combat.id,
      characterId: rollModParticipant.character.id, value,
    });
    setRollModOpen(false);
    setRollModParticipant(null);
    await refreshCombat();
  }

  async function handleReorderEnd() {
    if (!draggedRef.current || !isMaster) return;

    const newOrder = orderedParticipants.map((p: any, i: number) => ({ participantId: p.id, turnOrder: i }));

    try {
      await api.post("/combat/control", {
        action: "reorderTurns", combatId: combat.id,
        order: newOrder,
      });
      await refreshCombat();
    } finally {
      // Clear AFTER the refresh so the useEffect doesn't reset the order
      // from stale Pusher data that may arrive during the API call
      draggedRef.current = false;
    }
  }

  function exportLog() {
    if (!combat) return;
    const lines = combat.logs.map((l: any) => `[${l.type}] ${l.message}`).join("\n");
    const blob = new Blob([`=== Combate ${combat.id} — Round ${combat.round} ===\n\n${lines}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `combate-${combat.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!combat || !combat.participants?.length) return <>Carregando combate...</>;

  const ordered = [...combat.participants].sort((a: any, b: any) => a.turnOrder - b.turnOrder);
  const activeParticipant = ordered[combat.currentTurnIndex];
  const activeCharacter = activeParticipant.character;
  const myParticipant = ordered.find((p: any) => myCharacterIds.includes(p.character.id));

  // Personagem que este usuário pode transformar (mestre: o da vez; jogador: o seu)
  const transformChar = isMaster ? activeCharacter : myParticipant?.character;
  const myReactParticipant = isMaster ? activeParticipant : myParticipant;

  // Reações restantes na rodada (override do personagem > mesa; null = ilimitado)
  const reactionLimitBar: number | null =
    myReactParticipant?.character?.maxReactionsPerRound ?? activeCampaign?.reactionsPerRound ?? null;
  const reactionsLeftBar =
    reactionLimitBar == null
      ? null
      : Math.max(0, reactionLimitBar - (myReactParticipant?.reactionsUsed ?? 0));
  const transformHasForms =
    !!transformChar && ((transformChar.forms?.length ?? 0) > 0 || !!transformChar.primaryFormId);

  // Limite de transformações por dia (config da ficha principal; null =
  // ilimitado). Assumir uma forma consome 1; voltar à base é livre. Uso de
  // hoje vem escopado ao worldDay atual (ver combat/[id].ts)
  const transformLimit: number | null =
    transformChar?.primaryForm?.maxTransformationsPerDay ??
    transformChar?.maxTransformationsPerDay ??
    null;
  const transformsUsedToday: number =
    transformChar?.primaryForm?.transformationDailyUsages?.[0]?.usedCount ??
    transformChar?.transformationDailyUsages?.[0]?.usedCount ??
    0;
  const transformsLeft =
    transformLimit == null ? null : Math.max(0, transformLimit - transformsUsedToday);

  // Presets type=TRANSFORM só existem na ficha principal (nunca copiados
  // pras formas — ver forms.ts) — se a forma ativa em combate é uma
  // transformação, eles vêm por primaryForm; senão transformChar já é o
  // principal e seus próprios presets servem de fonte
  const transformPresets: ActionPresetType[] = transformChar?.primaryFormId
    ? (transformChar?.primaryForm?.presets ?? [])
    : (transformChar?.presets ?? []).filter((p: ActionPresetType) => p.type === "TRANSFORM");

  async function performTransform(preset: ActionPresetType) {
    if (!transformChar || formLoading || !canAct) return;
    const primaryId = transformChar.primaryFormId ?? transformChar.id;
    const formId = preset.targetFormId ?? primaryId;
    if (formId === transformChar.id) return; // já está nesta forma
    setFormLoading(true);
    try {
      await api.post(`/characters/${primaryId}/switch-form`, { formId });
      toast.success(`Transformado: ${preset.name}`);
      await refreshCombat();
    } catch {
      // mensagem de erro vem do interceptor (ex: reação pendente, limite diário)
    } finally {
      setFormLoading(false);
    }
  }
  const presetsSource = isMaster ? activeCharacter : (myParticipant?.character ?? activeCharacter);
  // Não inclui !actionUsed: cada botão de habilidade decide sozinho se
  // bloqueia (preset.requiresTurn && actionUsed) — ações livres
  // (requiresTurn === false) continuam disponíveis após a ação principal
  const canAct = isMyTurn && !pendingReactionRoll;
  const canEndTurn = isMyTurn && !pendingReactionRoll;

  // Habilidades exibidas em combate: a ficha transformada mostra apenas as
  // marcadas como "da forma" (se nenhuma foi marcada, mostra todas —
  // compatibilidade com formas antigas); a ficha base esconde as marcadas
  const isTransformedForm = !!presetsSource?.primaryFormId;
  const hasFormPresets = (presetsSource?.presets ?? []).some((p: ActionPresetType) => p.transformedOnly);
  const combatPresets: (ActionPresetType & { isAreaEffect?: boolean })[] =
    (presetsSource?.presets ?? []).filter((p: ActionPresetType) =>
      p.type !== "TRANSFORM" && (isTransformedForm ? (!hasFormPresets || p.transformedOnly) : !p.transformedOnly)
    );

  // Derived from the currently armed preset
  const selectedPreset = combatPresets.find((p) => p.id === selectedPresetId);
  const isAoe = !!(selectedPreset?.isAreaEffect) || selectedPreset?.targetType === "MULTIPLE";
  const isHealPreset = selectedPreset?.type === "HEAL" || selectedPreset?.type === "SUPPORT";

  // Limite de reações do alvo da reação pendente (override do personagem > mesa; null = ilimitado)
  const reactionTargetChar = pendingReactionRoll?.currentReactionTarget;
  const reactionParticipant = reactionTargetChar
    ? ordered.find((p: any) => p.character?.id === reactionTargetChar.id)
    : null;
  const reactionLimit: number | null =
    reactionTargetChar?.maxReactionsPerRound ?? activeCampaign?.reactionsPerRound ?? null;
  const reactionBlocked =
    reactionLimit != null && (reactionParticipant?.reactionsUsed ?? 0) >= reactionLimit;

  // Defesa efetiva do alvo da reação (base + buffs/debuffs de defesa ativos)
  const reactionTargetDefense = Math.max(0,
    (reactionTargetChar?.baseDefense ?? 0) +
    (reactionTargetChar?.statusEffects ?? []).reduce((sum: number, e: any) =>
      e.type === "DEFENSE_BUFF" ? sum + Math.abs(e.value)
      : e.type === "DEFENSE_DEBUFF" ? sum - Math.abs(e.value)
      : sum, 0)
  );

  return (
    <Box sx={{ height: "100vh", display: "grid", gridTemplateRows: "80px 1fr 0px", backgroundColor: "#0e0e1a", color: "#fff", overflow: "hidden" }}>
      <Head><title>Tela de combate</title></Head>

      {/* ===== HEADER ===== */}
      <Box sx={{ borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "space-between", px: 3 }}>
        <Stack direction="row" spacing={3} alignItems="center">
          <Typography variant="h6">Round {combat.round}</Typography>
          <Button size="small" variant="outlined" onClick={refreshCombat}>Atualizar agora</Button>
          {!isMaster && <DiceInputRoller characterId={myCharacterIds[0]} />}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          {isMaster && (
            <Tooltip title="Exportar log">
              <IconButton size="small" onClick={exportLog} sx={{ color: "#aaa" }}>
                <FileDownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {isMaster && (
            <Button size="small" variant="outlined" color="secondary" onClick={openAddParticipant}>
              + Adicionar Personagem
            </Button>
          )}
          {isMaster && (
            <Button color="error" variant="outlined" disabled={isLoading} onClick={endCombat}>
              {isLoading ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
              Encerrar Combate
            </Button>
          )}
        </Stack>
      </Box>

      {/* ===== CENTRO ===== */}
      <Box sx={{ display: "grid", gridTemplateColumns: "280px 1fr 400px", overflow: "hidden" }}>

        {/* ORDEM DE TURNO */}
        <Box sx={{ p: 2, borderRight: "1px solid rgba(51,51,51,0.6)", overflow: "auto", background: "linear-gradient(135deg, rgba(28,28,46,0.4) 0%, rgba(14,14,26,0.8) 100%)" }}>
          <Typography variant="h6" mb={2} sx={{ fontWeight: "bold", fontSize: "1.1rem", letterSpacing: 0.5 }}>
            Ordem de Turno
            {isMaster && <Typography component="span" fontSize={10} color="#666" ml={1}>(arraste para reordenar)</Typography>}
          </Typography>

          <Reorder.Group axis="y" values={orderedParticipants} onReorder={(v) => { if (isMaster) { draggedRef.current = true; setOrderedParticipants(v); } }} style={{ padding: 0, margin: 0, listStyle: "none" }} as="div">
            <Stack spacing={1.5}>
              {orderedParticipants.map((p: any, index: number) => {
                const isActive = p.turnOrder === combat.currentTurnIndex;
                const isTarget = selectedTargets.includes(p.character.id);
                const isNpc = checkIsNpc(p.character, masterId);
                const showExactHp = isMaster || !isNpc;
                const tier = getHpTier(p.currentLife, p.character.maxLife);
                const hpPct = p.character.maxLife > 0 ? (p.currentLife / p.character.maxLife) * 100 : 0;
                const floating = floatingDamages[p.character.id] ?? [];
                const hitFx = floating.some((f) => !f.isHeal);
                const healFx = !hitFx && floating.length > 0;

                return (
                  <Reorder.Item
                    key={p.id}
                    value={p}
                    as="div"
                    dragListener={isMaster}
                    onDragEnd={handleReorderEnd}
                    animate={isActive ? {
                      boxShadow: ["0 0 18px rgba(79,195,247,0.5)", "0 0 32px rgba(79,195,247,0.95)", "0 0 18px rgba(79,195,247,0.5)"],
                    } : { boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                    transition={isActive
                      ? { duration: 2, repeat: Infinity, ease: "easeInOut", layout: { duration: 0 } }
                      : { layout: { duration: 0 } }}
                    style={{ borderRadius: 8, cursor: isMaster ? "grab" : "default", position: "relative" }}
                  >
                    {/* Floating damage/heal numbers */}
                    <AnimatePresence>
                      {floating.map((ev) => (
                        <motion.div
                          key={ev.id}
                          initial={{ opacity: 0, y: 6, scale: 0.4 }}
                          animate={{ opacity: [0, 1, 1, 0], y: -54, scale: [0.4, ev.big ? 1.45 : 1.15, 1, 1] }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.6, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 8 + ev.xJitter,
                            zIndex: 20,
                            pointerEvents: "none",
                            fontWeight: 900,
                            fontSize: ev.big ? 26 : 18,
                            fontFamily: "monospace",
                            color: ev.isHeal ? "#4ade80" : ev.big ? "#fbbf24" : "#f87171",
                            textShadow: ev.isHeal
                              ? "0 0 10px rgba(74,222,128,0.9), 0 1px 2px #000"
                              : ev.big
                                ? "0 0 12px rgba(251,146,60,0.95), 0 1px 2px #000"
                                : "0 0 8px rgba(248,113,113,0.9), 0 1px 2px #000",
                          }}
                        >
                          {ev.big && !ev.isHeal ? "💥" : ""}{ev.isHeal ? "+" : "−"}{ev.delta}
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <Card
                      onClick={() => {
                        if (!canAct || !selectedPresetId) return;
                        const isSelf = p.character.id === activeCharacter.id;
                        if (isSelf && !isHealPreset) return;
                        selectTarget(p.character.id, isAoe);
                      }}
                      sx={{
                        cursor: canAct && selectedPresetId && (p.character.id !== activeCharacter.id || isHealPreset) ? "pointer" : isMaster ? "grab" : "default",
                        backgroundColor: hitFx ? "rgba(239,68,68,0.16)"
                          : isTarget
                          ? (isHealPreset ? "rgba(74,222,128,0.15)" : "rgba(239,83,80,0.15)")
                          : (isHealPreset && p.character.id === activeCharacter.id && canAct ? "rgba(74,222,128,0.05)" : isActive ? "rgba(42,42,85,0.8)" : "rgba(28,28,46,0.6)"),
                        border: isActive ? "2px solid #4fc3f7"
                          : isTarget ? (isHealPreset ? "2px solid #4ade80" : "2px solid #ef5350")
                          : (isHealPreset && p.character.id === activeCharacter.id && canAct ? "1px solid rgba(74,222,128,0.35)" : "1px solid rgba(51,51,51,0.8)"),
                        opacity: p.currentLife <= 0 ? 0.45 : 1,
                        boxShadow: hitFx ? "0 0 16px rgba(239,68,68,0.55)" : healFx ? "0 0 16px rgba(74,222,128,0.45)" : undefined,
                        animation: hitFx ? "combatCardShake 0.45s ease" : undefined,
                        "@keyframes combatCardShake": {
                          "0%, 100%": { transform: "translateX(0)" },
                          "20%": { transform: "translateX(-5px)" },
                          "40%": { transform: "translateX(5px)" },
                          "60%": { transform: "translateX(-3px)" },
                          "80%": { transform: "translateX(3px)" },
                        },
                        transition: "background 0.3s, border 0.3s, opacity 0.3s, box-shadow 0.3s",
                      }}
                    >
                      <CardContent sx={{ pb: "12px !important", px: 1.5 }}>
                        {/* Header row: index + avatar + name + badges */}
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.75}>
                          <Typography fontSize={10} color="#555" fontWeight={700} sx={{ minWidth: 14 }}>#{index + 1}</Typography>

                          <Avatar
                            src={characterImageSrc(p.character.image)}
                            alt={p.character.name}
                            sx={{ width: 28, height: 28, fontSize: 11, bgcolor: isActive ? "#4fc3f7" : "#374151", border: isActive ? "2px solid #4fc3f7" : "1px solid #555" }}
                          >
                            {p.character.name[0]}
                          </Avatar>

                          <Typography fontSize={13} fontWeight={600} flex={1} noWrap>{p.character.name}</Typography>

                          <Stack direction="row" alignItems="center" spacing={0.25}>
                            {p.character.primaryFormId && (
                              <Chip label="🜂" size="small" title="Forma alternativa (transformado)" sx={{ fontSize: 10, height: 16, bgcolor: "rgba(124,58,237,0.25)", color: "#a78bfa" }} />
                            )}
                            {isNpc && <Chip label="NPC" size="small" sx={{ fontSize: 9, height: 16, bgcolor: "#374151", color: "#9ca3af" }} />}
                            {isMaster && (
                              <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); setHpEditParticipant(p); setHpEditValue(p.currentLife); setHpEditOpen(true); }}>
                                <EditIcon sx={{ fontSize: 13, color: "#666" }} />
                              </IconButton>
                            )}
                          </Stack>
                        </Stack>

                        {/* HP */}
                        {showExactHp ? (
                          <>
                            <HpBar current={p.currentLife} max={p.character.maxLife} tempHp={p.tempHp ?? 0} />
                            <Stack direction="row" alignItems="center" spacing={0.75} mt={0.5}>
                              <Typography fontSize={11} color="#aaa">{p.currentLife} / {p.character.maxLife} HP</Typography>
                              {(p.tempHp ?? 0) > 0 && (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, px: 0.75, py: 0.1, borderRadius: 1, bgcolor: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)" }}>
                                  <Typography fontSize={10} lineHeight={1}>🛡</Typography>
                                  <Typography fontSize={11} color="#60a5fa" fontWeight={700} lineHeight={1}>{p.tempHp}</Typography>
                                </Box>
                              )}
                            </Stack>
                          </>
                        ) : (
                          <Box mt={0.75} sx={{ px: 1.5, py: 0.4, borderRadius: 1, bgcolor: tier.bgColor, border: `1px solid ${tier.color}40`, display: "inline-block" }}>
                            <Typography fontSize={11} color={tier.color} fontWeight={600}>{tier.label}</Typography>
                          </Box>
                        )}

                        {/* Sanidade — só o mestre vê (a API já oculta o campo pra jogadores) */}
                        {isMaster && p.character.sanity != null && (
                          <Box
                            onClick={(e) => { e.stopPropagation(); setSanityEditParticipant(p); setSanityEditValue(p.character.sanity); setSanityEditOpen(true); }}
                            sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, mt: 0.5, px: 0.75, py: 0.15, borderRadius: 1, bgcolor: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.35)", cursor: "pointer" }}
                          >
                            <Typography fontSize={10} lineHeight={1}>🧠</Typography>
                            <Typography fontSize={11} color="#c084fc" fontWeight={700} lineHeight={1}>
                              {p.character.sanity}{p.character.maxSanity != null ? ` / ${p.character.maxSanity}` : ""}
                            </Typography>
                          </Box>
                        )}

                        {/* Vantagem/desvantagem pendente — some sozinha na próxima rolagem */}
                        {(p.character.pendingRollModifier != null || isMaster) && (
                          <Box
                            onClick={(e) => {
                              if (!isMaster) return;
                              e.stopPropagation();
                              setRollModParticipant(p);
                              setRollModValue(p.character.pendingRollModifier != null ? String(p.character.pendingRollModifier) : "5");
                              setRollModOpen(true);
                            }}
                            sx={{
                              display: p.character.pendingRollModifier != null ? "inline-flex" : isMaster ? "inline-flex" : "none",
                              alignItems: "center", gap: 0.4, mt: 0.5, ml: p.character.sanity != null ? 0.5 : 0,
                              px: 0.75, py: 0.15, borderRadius: 1,
                              bgcolor: p.character.pendingRollModifier != null
                                ? (p.character.pendingRollModifier > 0 ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)")
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${p.character.pendingRollModifier != null ? (p.character.pendingRollModifier > 0 ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)") : "rgba(255,255,255,0.15)"}`,
                              cursor: isMaster ? "pointer" : "default",
                            }}
                          >
                            <Typography fontSize={10} lineHeight={1}>🎲</Typography>
                            <Typography fontSize={11} fontWeight={700} lineHeight={1}
                              color={p.character.pendingRollModifier == null ? "#888" : p.character.pendingRollModifier > 0 ? "#4ade80" : "#f87171"}>
                              {p.character.pendingRollModifier != null
                                ? `${p.character.pendingRollModifier > 0 ? "+" : ""}${p.character.pendingRollModifier}`
                                : "definir"}
                            </Typography>
                          </Box>
                        )}

                        {/* Active effects */}
                        <EffectChips effects={p.character.statusEffects} />
                      </CardContent>
                    </Card>
                  </Reorder.Item>
                );
              })}
            </Stack>
          </Reorder.Group>
        </Box>

        {/* CAMPO DE BATALHA */}
        <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid rgba(107,122,219,0.2)", background: "radial-gradient(circle at center, #1a1a2e 0%, #0e0e1a 70%)", position: "relative" }}>
          {/* Barra de título */}
          <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid rgba(107,122,219,0.15)", display: "flex", alignItems: "center", gap: 1, backgroundColor: "rgba(14,14,26,0.8)", flexShrink: 0 }}>
            <Typography fontSize={11} color={screenShareActive ? "#4ade80" : "#555"} sx={{ flex: 1 }}>
              {screenShareActive ? "🔴 Tela compartilhada" : "Campo de batalha"}
            </Typography>
            <Tooltip title="Tela cheia">
              <IconButton onClick={handleBattleFullscreen} sx={{ color: "#444", "&:hover": { color: "#aaa" } }}>
                <FullscreenIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Conteúdo: tela compartilhada ou placeholder */}
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {screenShareActive && screenShareStream ? (
              <video
                ref={battleVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <Typography color="#333" fontSize={12} textAlign="center">
                {isMaster ? "Compartilhe sua tela na tela inicial" : "Aguardando compartilhamento do mestre…"}
              </Typography>
            )}
          </Box>
        </Box>

        {/* LOG */}
        <Box sx={{ p: 2, borderLeft: "1px solid rgba(17,16,16,0.6)", display: "flex", flexDirection: "column", overflow: "hidden", background: "linear-gradient(135deg, rgba(14,14,26,0.8) 0%, rgba(28,28,46,0.4) 100%)" }}>
          <Box flex={1} overflow="auto">
            <CombatTimelineV2 logs={combat.logs ?? []} />
          </Box>
        </Box>
      </Box>

      <Divider sx={{ borderColor: "#333" }} />

      {/* ===== ACTION BAR ===== */}
      <Box sx={{ p: 2, minHeight: 125, maxHeight: 180, overflow: "auto", borderTop: isMyTurn && !pendingReactionRoll ? "2px solid rgba(79,195,247,0.8)" : "2px solid rgba(107,122,219,0.3)", background: isMyTurn && !pendingReactionRoll ? "linear-gradient(90deg, rgba(79,195,247,0.08) 0%, rgba(14,14,26,0.8) 100%)" : "linear-gradient(90deg, rgba(28,28,46,0.6) 0%, rgba(14,14,26,0.8) 100%)", transition: "border-color 0.4s, background 0.4s" }}>
        <Stack spacing={2}>
          <Box sx={{ pb: 1, borderBottom: "1px solid rgba(107,122,219,0.2)" }}>
            <Typography color={isMyTurn && !pendingReactionRoll ? "#4fc3f7" : "#8B9DFF"} fontSize={14} fontWeight={500}>
              {pendingReactionRoll ? `⚠️ Você está sendo atacado por ${pendingReactionRoll.attackerName}` : isMyTurn ? `⚔️ ${activeCharacter.name} — É o SEU TURNO!` : `Aguardando o turno de ${activeCharacter.name}...`}
            </Typography>
            {actionUsed && <Typography fontSize={12} color="#ffa726" mt={0.5}>⚡ Ação principal já utilizada neste turno</Typography>}
            {isMyTurn && !actionUsed && attackLimit > 1 && (
              <Typography fontSize={12} color="#4fc3f7" mt={0.5}>⚔️ Ataques restantes nesta rodada: {attacksLeft}/{attackLimit}</Typography>
            )}
            {reactionsLeftBar !== null && myReactParticipant && (
              <Typography fontSize={12} color={reactionsLeftBar > 0 ? "#ffb74d" : "#f87171"} mt={0.5}>
                🛡️ Reações restantes nesta rodada: {reactionsLeftBar}/{reactionLimitBar}
              </Typography>
            )}
            {transformsLeft !== null && transformHasForms && (
              <Typography fontSize={12} color={transformsLeft > 0 ? "#a78bfa" : "#f87171"} mt={0.5}>
                🜂 Transformações restantes hoje: {transformsLeft}/{transformLimit} (voltar à base é livre)
              </Typography>
            )}
            {!isMyTurn && !isMaster && myParticipant && <Typography fontSize={11} color="#6b7280" mt={0.5}>Suas habilidades — disponíveis no seu turno</Typography>}
          </Box>

          <Stack direction="row" spacing={1.5} flexWrap="wrap">
            {combatPresets.map((preset) => {
              const needsTarget = preset.targetType !== "SELF";
              const presetIsAoe = !!(preset.isAreaEffect) || preset.targetType === "MULTIPLE";
              const isArmed = selectedPresetId === preset.id;
              const presetIsHeal = preset.type === "HEAL" || preset.type === "SUPPORT";
              if (["TEST", "REACT"].includes(preset.type)) return null;

              const usedToday = preset.dailyUsages?.[0]?.usedCount ?? 0;
              const dailyExhausted = preset.usesPerDay != null && usedToday >= preset.usesPerDay;

              return (
                <Tooltip
                  key={preset.id}
                  title={presetTooltipContent(preset, buildAttributeValueMap(presetsSource))}
                  placement="top"
                  arrow
                  componentsProps={{ tooltip: { sx: { backgroundColor: "#1a1a2e", border: "1px solid rgba(107,122,219,0.4)", maxWidth: 280 } } }}
                >
                  <Box sx={{ position: "relative" }}>
                    <Button
                      variant={isArmed ? "contained" : preset.requiresTurn ? "contained" : "outlined"}
                      color={isArmed ? (presetIsHeal ? "success" : "secondary") : preset.requiresTurn ? "primary" : "inherit"}
                      disabled={!canAct || isLoading || (preset.requiresTurn && actionUsed) || dailyExhausted}
                      onClick={() => {
                        if (!canAct || isLoading || (preset.requiresTurn && actionUsed) || dailyExhausted) return;
                        if (!needsTarget) {
                          useMainAction({ presetId: preset.id, targetIds: [], characterId: activeCharacter.id, presetType: preset.type, requiresTurn: preset.requiresTurn });
                          return;
                        }
                        if (isArmed && selectedTargets.length > 0) {
                          useMainAction({ presetId: preset.id, targetIds: selectedTargets, characterId: activeCharacter.id, presetType: preset.type, requiresTurn: preset.requiresTurn });
                          setSelectedPresetId(null);
                        } else {
                          if (selectedPresetId !== preset.id) clearTargets();
                          setSelectedPresetId(preset.id);
                        }
                      }}
                      sx={{
                        transition: "all 0.3s",
                        pr: presetIsAoe ? 4 : undefined,
                        outline: isArmed ? "2px solid rgba(167,139,250,0.7)" : "none",
                        outlineOffset: 2,
                        "&:hover:not(:disabled)": { boxShadow: "0 0 12px rgba(107,122,219,0.5)", transform: "translateY(-2px)" },
                      }}
                    >
                      {preset.name}
                    </Button>
                    {presetIsAoe && (
                      <Chip label="Área" size="small" sx={{ position: "absolute", top: -8, right: -8, height: 16, fontSize: 9, bgcolor: "#7c3aed", color: "#fff", pointerEvents: "none" }} />
                    )}
                    {preset.usesPerDay != null && (
                      <Chip
                        label={`${usedToday}/${preset.usesPerDay} dia`}
                        size="small"
                        sx={{
                          position: "absolute", bottom: -8, left: -8, height: 16, fontSize: 9, pointerEvents: "none",
                          bgcolor: dailyExhausted ? "#7f1d1d" : "#1e3a5f",
                          color: dailyExhausted ? "#fca5a5" : "#93c5fd",
                        }}
                      />
                    )}
                  </Box>
                </Tooltip>
              );
            })}

            {transformPresets.map((preset) => {
              const primaryId = transformChar?.primaryFormId ?? transformChar?.id;
              const formId = preset.targetFormId ?? primaryId;
              const isCurrent = formId === transformChar?.id;
              const isRevert = preset.targetFormId == null;
              const limitBlocked = !isRevert && transformLimit != null && (transformsLeft ?? 0) <= 0;
              const disabled = !canAct || formLoading || !!pendingReactionRoll || isCurrent || limitBlocked;

              return (
                <Tooltip
                  key={preset.id}
                  title={transformPresetTooltipContent(preset, isCurrent, transformLimit, transformsLeft)}
                  placement="top"
                  arrow
                  componentsProps={{ tooltip: { sx: { backgroundColor: "#1a1a2e", border: "1px solid rgba(124,58,237,0.4)", maxWidth: 280 } } }}
                >
                  <Box sx={{ position: "relative", display: "inline-flex" }}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<AutorenewIcon />}
                      disabled={disabled}
                      onClick={() => performTransform(preset)}
                      sx={{ borderColor: "rgba(124,58,237,0.5)", color: "#a78bfa" }}
                    >
                      {formLoading ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
                      {preset.name}
                    </Button>
                    {!isRevert && transformLimit != null && (
                      <Chip
                        label={`${transformsLeft ?? 0}/${transformLimit} dia`}
                        size="small"
                        sx={{
                          position: "absolute", bottom: -8, left: -8, height: 16, fontSize: 9, pointerEvents: "none",
                          bgcolor: (transformsLeft ?? 0) <= 0 ? "#7f1d1d" : "#3b1e5f",
                          color: (transformsLeft ?? 0) <= 0 ? "#fca5a5" : "#c4b5fd",
                        }}
                      />
                    )}
                    {isCurrent && (
                      <Chip label="Atual" size="small" sx={{ position: "absolute", top: -8, right: -8, height: 16, fontSize: 9, bgcolor: "#4c1d95", color: "#e9d5ff", pointerEvents: "none" }} />
                    )}
                  </Box>
                </Tooltip>
              );
            })}

            {isMyTurn && (
              <Button variant="outlined" disabled={!canEndTurn || isLoading} onClick={endTurn}>
                {isLoading ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
                Passar Turno
              </Button>
            )}
          </Stack>

          {canAct && !selectedPresetId && (
            <Typography fontSize={12} color="#ff9800">Selecione uma habilidade acima para agir.</Typography>
          )}
          {canAct && selectedPresetId && selectedTargets.length === 0 && (
            <Typography fontSize={12} color="#4fc3f7">
              {isAoe ? "🎯 Selecione um ou mais alvos" : "🎯 Selecione um alvo"}
              {isHealPreset ? " (você mesmo ou qualquer participante)" : " inimigo"}
              {" "}— então clique em <strong>{selectedPreset?.name}</strong> para executar.
            </Typography>
          )}
          {canAct && selectedPresetId && selectedTargets.length > 0 && (
            <Typography fontSize={12} color="#a78bfa">
              🎯 {selectedTargets.length} alvo{selectedTargets.length > 1 ? "s" : ""} selecionado{selectedTargets.length > 1 ? "s" : ""} — clique em <strong>{selectedPreset?.name}</strong> para executar.
            </Typography>
          )}
        </Stack>
      </Box>

      {/* ===== MODAL REAÇÃO ===== */}
      <Dialog open={Boolean(pendingReactionRoll)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: "#ffb74d", pb: 1 }}>
          ⚠️ Reação de Ataque ({pendingReactionRoll?.currentTargetIndex} de {pendingReactionRoll?.totalTargets})
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Box sx={{ textAlign: "center", py: 0.5 }}>
              <Typography variant="h6" fontWeight={700}>
                {pendingReactionRoll?.attackerName} atacou {pendingReactionRoll?.currentReactionTarget?.name}!
              </Typography>
              {pendingReactionRoll?.critical && (
                <Typography variant="caption" sx={{ color: "#f97316", fontWeight: 700, fontSize: 12 }}>
                  🔥 ACERTO CRÍTICO!
                </Typography>
              )}
            </Box>

            {/* Attack stats */}
            <Stack direction="row" spacing={1.5} justifyContent="center">
              <Box sx={{ textAlign: "center", px: 2, py: 1.25, borderRadius: 1.5, backgroundColor: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", minWidth: 80 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>Rolagem</Typography>
                <Typography variant="h5" color="#f87171" fontWeight={800} lineHeight={1}>{pendingReactionRoll?.total}</Typography>
                {(pendingReactionRoll?.rolls?.length ?? 0) > 0 && (
                  <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: 9, color: "#777" }}>
                    ({pendingReactionRoll!.rolls.join(", ")}){pendingReactionRoll!.modifier > 0 ? ` +${pendingReactionRoll!.modifier}` : pendingReactionRoll!.modifier < 0 ? ` ${pendingReactionRoll!.modifier}` : ""}
                  </Typography>
                )}
              </Box>

              {(pendingReactionRoll?.damage ?? 0) > 0 && (
                <Box sx={{ textAlign: "center", px: 2, py: 1.25, borderRadius: 1.5, backgroundColor: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", minWidth: 80 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>Dano</Typography>
                  <Typography variant="h5" color="#f87171" fontWeight={800} lineHeight={1}>{pendingReactionRoll!.damage}</Typography>
                </Box>
              )}

              {reactionTargetDefense > 0 && (
                <Box sx={{ textAlign: "center", px: 2, py: 1.25, borderRadius: 1.5, backgroundColor: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", minWidth: 80 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>Sua Defesa</Typography>
                  <Typography variant="h5" color="#60a5fa" fontWeight={800} lineHeight={1}>{reactionTargetDefense}</Typography>
                </Box>
              )}
            </Stack>

            {pendingReactionRoll?.totalTargets > 1 && (
              <LinearProgress variant="determinate" value={((pendingReactionRoll?.currentTargetIndex ?? 0) / (pendingReactionRoll?.totalTargets ?? 1)) * 100} sx={{ height: 6, borderRadius: 1 }} />
            )}

            {reactionBlocked ? (
              <Typography variant="body2" sx={{ color: "#f87171", fontWeight: 600 }}>
                🚫 Limite de {reactionLimit} reação(ões) por rodada atingido — não é possível reagir a este ataque.
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Escolha sua reação:
                {reactionLimit != null && (
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: "#ffb74d" }}>
                    ({Math.max(0, reactionLimit - (reactionParticipant?.reactionsUsed ?? 0))} de {reactionLimit} restante(s) nesta rodada)
                  </Typography>
                )}
              </Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {pendingReactionRoll?.currentReactionTarget?.blockPresetId && (
                <Button variant="contained" color="warning" size="small" disabled={reactionBlocked} onClick={() => resolveReaction(pendingReactionRoll.id, "BLOCK")}>🛡️ Bloquear</Button>
              )}
              {pendingReactionRoll?.currentReactionTarget?.dodgePresetId && (
                <Button variant="contained" color="warning" size="small" disabled={reactionBlocked} onClick={() => resolveReaction(pendingReactionRoll.id, "DODGE")}>💨 Esquivar</Button>
              )}
              {pendingReactionRoll?.currentReactionTarget?.counterAttackPresetId && (
                <Button variant="contained" color="warning" size="small" disabled={reactionBlocked} onClick={() => resolveReaction(pendingReactionRoll.id, "COUNTER_ATTACK")}>⚔️ Contra-atacar</Button>
              )}
              <Button color="error" size="small" variant={reactionBlocked ? "contained" : "text"} onClick={() => resolveReaction(pendingReactionRoll.id, "SKIP")}>
                {reactionBlocked ? "Absorver o dano" : "✗ Não reagir"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL ADICIONAR PARTICIPANTE ===== */}
      <Dialog open={addParticipantOpen} onClose={() => setAddParticipantOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adicionar Personagem ao Combate</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {loadingChars ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress size={32} /></Box>
          ) : availableChars.length === 0 ? (
            <Typography color="#888" p={2} textAlign="center">Nenhum personagem disponível.</Typography>
          ) : (
            <List dense>
              {availableChars.map((char: any) => (
                <ListItem key={char.id} disablePadding>
                  <ListItemButton onClick={() => addParticipant(char.id)}>
                    <Avatar src={characterImageSrc(char.image)} sx={{ width: 28, height: 28, mr: 1.5, fontSize: 12 }}>{char.name[0]}</Avatar>
                    <ListItemText primary={char.name} secondary={`HP: ${char.life}/${char.maxLife} • ${char.owner?.username ?? ""}`} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddParticipantOpen(false)} color="inherit">Cancelar</Button>
        </DialogActions>
      </Dialog>

      {/* ===== MODAL AJUSTE HP ===== */}
      <Dialog open={hpEditOpen} onClose={() => setHpEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Ajustar HP — {hpEditParticipant?.character?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Typography fontSize={13} color="#aaa">HP atual: {hpEditParticipant?.currentLife} / {hpEditParticipant?.character?.maxLife}</Typography>
            <TextField label="Novo HP" type="number" value={hpEditValue} onChange={(e) => setHpEditValue(Number(e.target.value))} inputProps={{ min: 0, max: hpEditParticipant?.character?.maxLife ?? 9999 }} fullWidth autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHpEditOpen(false)} color="inherit">Cancelar</Button>
          <Button variant="contained" onClick={submitHpEdit}>Confirmar</Button>
        </DialogActions>
      </Dialog>

      {/* AJUSTE MANUAL DE SANIDADE (mestre) */}
      <Dialog open={sanityEditOpen} onClose={() => setSanityEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Ajustar Sanidade — {sanityEditParticipant?.character?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Typography fontSize={13} color="#aaa">
              Sanidade atual: {sanityEditParticipant?.character?.sanity}
              {sanityEditParticipant?.character?.maxSanity != null ? ` / ${sanityEditParticipant.character.maxSanity}` : ""}
            </Typography>
            <TextField label="Nova sanidade" type="number" value={sanityEditValue} onChange={(e) => setSanityEditValue(Number(e.target.value))} inputProps={{ min: 0, max: sanityEditParticipant?.character?.maxSanity ?? 9999 }} fullWidth autoFocus />
            <Typography fontSize={11} color="text.secondary">Visível apenas para o mestre — o jogador nunca vê este valor.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSanityEditOpen(false)} color="inherit">Cancelar</Button>
          <Button variant="contained" onClick={submitSanityEdit}>Confirmar</Button>
        </DialogActions>
      </Dialog>

      {/* VANTAGEM/DESVANTAGEM — modificador na próxima rolagem */}
      <Dialog open={rollModOpen} onClose={() => setRollModOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Vantagem/Desvantagem — {rollModParticipant?.character?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Typography fontSize={13} color="#aaa">
              Vale para todas as rolagens de {rollModParticipant?.character?.name} (ataque, teste ou reação) nesta rodada — some sozinho quando a rodada avançar.
            </Typography>
            <TextField label="Modificador" type="number" value={rollModValue} onChange={(e) => setRollModValue(e.target.value)} fullWidth autoFocus helperText="Positivo = vantagem, negativo = desvantagem" />
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={() => setRollModValue("5")}>+5 Vantagem</Button>
              <Button size="small" variant="outlined" onClick={() => setRollModValue("-5")}>-5 Desvantagem</Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => submitRollModifier(null)} color="inherit">Limpar</Button>
          <Button onClick={() => setRollModOpen(false)} color="inherit">Cancelar</Button>
          <Button variant="contained" onClick={() => submitRollModifier(rollModValue === "" ? null : Number(rollModValue))}>Confirmar</Button>
        </DialogActions>
      </Dialog>

      {/* ESCOLHA DE EFEITO (habilidade com múltiplos efeitos configuráveis) */}
      <Dialog open={!!effectSelectionRequest} onClose={cancelEffectSelection} maxWidth="xs" fullWidth>
        <DialogTitle>
          {effectSelectionRequest?.mode === "CHOOSE_ANY" ? "Escolha um ou mais efeitos" : "Escolha um efeito"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            {effectSelectionRequest?.effects.map((eff) => {
              const isChecked = chosenEffectIds.includes(eff.id);
              const isRadio = effectSelectionRequest.mode === "CHOOSE_ONE";
              return (
                <Box
                  key={eff.id}
                  onClick={() => {
                    if (isRadio) setChosenEffectIds([eff.id]);
                    else setChosenEffectIds((prev) => isChecked ? prev.filter((id) => id !== eff.id) : [...prev, eff.id]);
                  }}
                  sx={{
                    p: 1.25, borderRadius: 1, cursor: "pointer",
                    border: isChecked ? "2px solid #8B9DFF" : "1px solid rgba(255,255,255,0.15)",
                    bgcolor: isChecked ? "rgba(139,157,255,0.1)" : "transparent",
                  }}
                >
                  <Typography fontSize={14} fontWeight={600}>{eff.name}</Typography>
                  {eff.description && (
                    <Typography fontSize={12} color="text.secondary">{eff.description}</Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelEffectSelection} color="inherit">Cancelar</Button>
          <Button
            variant="contained"
            disabled={chosenEffectIds.length === 0}
            onClick={() => confirmEffectSelection(chosenEffectIds)}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== ESTATÍSTICAS DO COMBATE ===== */}
      <Dialog open={Boolean(combatStats)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: "#fbbf24" }}>⚔️ Combate Encerrado — Resumo</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography fontSize={13} color="#aaa">Duração: {combatStats?.rounds ?? 0} round(s)</Typography>
            {(combatStats?.participants ?? []).length > 0 && (
              <Box sx={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Personagem", "Acertos", "Erros", "Dano Total", "Maior Hit"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "#888", borderBottom: "1px solid #333" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {combatStats?.participants.map((p) => (
                      <tr key={p.id}>
                        <td style={{ padding: "4px 8px", color: "#e5e7eb" }}>{p.name}</td>
                        <td style={{ padding: "4px 8px", color: "#4ade80" }}>{p.hits}</td>
                        <td style={{ padding: "4px 8px", color: "#f87171" }}>{p.misses}</td>
                        <td style={{ padding: "4px 8px", color: "#fbbf24", fontWeight: 700 }}>{p.totalDamage}</td>
                        <td style={{ padding: "4px 8px", color: "#f97316" }}>{p.maxHit || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => { clearStats(); router.push("/protected/"); }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== FULLSCREEN VISÃO GERAL ===== */}
      <AnimatePresence>
        {battleFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: "fixed", inset: 0, zIndex: 1300, background: "#080810", overflow: "auto" }}
          >
            <Box sx={{ p: 3 }}>
              {/* Header */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
                <Stack>
                  <Typography variant="h5" fontWeight="bold">⚔️ Visão Geral do Combate</Typography>
                  <Typography color="#666" fontSize={13}>Round {combat.round} — {ordered.length} participantes</Typography>
                </Stack>
                <IconButton onClick={() => setBattleFullscreen(false)} sx={{ color: "#aaa" }}>
                  <FullscreenExitIcon />
                </IconButton>
              </Stack>

              {/* Tela compartilhada fullscreen */}
              {screenShareActive && screenShareStream && (
                <Box sx={{ mb: 3, borderRadius: 2, overflow: "hidden", border: "1px solid rgba(107,122,219,0.3)", height: 480, position: "relative" }}>
                  <video
                    ref={fullscreenVideoRef}
                    autoPlay
                    playsInline
                    muted={fullscreenMuted}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                  <Tooltip title={fullscreenMuted ? "Ativar áudio" : "Silenciar"}>
                    <IconButton
                      onClick={() => setFullscreenMuted((v) => !v)}
                      sx={{ position: "absolute", top: 8, right: 8, color: "#ccc", backgroundColor: "rgba(0,0,0,0.4)", "&:hover": { backgroundColor: "rgba(0,0,0,0.6)" } }}
                    >
                      {fullscreenMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
              )}

              {/* Participants grid */}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 2 }}>
                {ordered.map((p: any) => {
                  const isActive = p.turnOrder === combat.currentTurnIndex;
                  const isNpc = checkIsNpc(p.character, masterId);
                  const showExactHp = isMaster || !isNpc;
                  const tier = getHpTier(p.currentLife, p.character.maxLife);
                  const hpPct = p.character.maxLife > 0 ? (p.currentLife / p.character.maxLife) * 100 : 0;

                  return (
                    <Card
                      key={p.id}
                      sx={{
                        bgcolor: isActive ? "rgba(79,195,247,0.1)" : "rgba(28,28,46,0.8)",
                        border: isActive ? "2px solid #4fc3f7" : "1px solid rgba(255,255,255,0.08)",
                        opacity: p.currentLife <= 0 ? 0.45 : 1,
                      }}
                    >
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} mb={1.5}>
                          <Avatar
                            src={characterImageSrc(p.character.image)}
                            alt={p.character.name}
                            sx={{ width: 48, height: 48, fontSize: 18, bgcolor: isActive ? "#4fc3f7" : "#374151", border: isActive ? "2px solid #4fc3f7" : "1px solid #555" }}
                          >
                            {p.character.name[0]}
                          </Avatar>
                          <Stack flex={1} minWidth={0}>
                            <Typography fontWeight={700} noWrap>{p.character.name}</Typography>
                            <Stack direction="row" spacing={0.5} mt={0.25}>
                              {isActive && <Chip label="Turno ativo" size="small" sx={{ fontSize: 10, height: 18, bgcolor: "#4fc3f7", color: "#000" }} />}
                              {p.character.primaryFormId && (
                                <Chip label="🜂 Transformado" size="small" title="Forma alternativa" sx={{ fontSize: 10, height: 18, bgcolor: "rgba(124,58,237,0.25)", color: "#a78bfa" }} />
                              )}
                              {isNpc && <Chip label="NPC" size="small" sx={{ fontSize: 10, height: 18, bgcolor: "#374151", color: "#9ca3af" }} />}
                              {p.currentLife <= 0 && <Chip label="Morto" size="small" sx={{ fontSize: 10, height: 18, bgcolor: "#333", color: "#666" }} />}
                            </Stack>
                          </Stack>
                        </Stack>

                        {showExactHp ? (
                          <>
                            <HpBar current={p.currentLife} max={p.character.maxLife} tempHp={p.tempHp ?? 0} height={10} />
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mt={0.5}>
                              <Stack direction="row" alignItems="center" spacing={0.75}>
                                <Typography fontSize={12} color="#aaa">{p.currentLife} / {p.character.maxLife} HP</Typography>
                                {(p.tempHp ?? 0) > 0 && (
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, py: 0.2, borderRadius: 1, bgcolor: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)" }}>
                                    <Typography fontSize={11} lineHeight={1}>🛡</Typography>
                                    <Typography fontSize={12} color="#60a5fa" fontWeight={700} lineHeight={1}>{p.tempHp}</Typography>
                                  </Box>
                                )}
                              </Stack>
                              <Typography fontSize={12} color={tier.color} fontWeight={600}>{tier.label}</Typography>
                            </Stack>
                          </>
                        ) : (
                          <Box sx={{ px: 2, py: 0.75, borderRadius: 1, bgcolor: tier.bgColor, border: `1px solid ${tier.color}40`, mt: 0.5 }}>
                            <Typography fontSize={12} color={tier.color} fontWeight={600} textAlign="center">{tier.label}</Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
