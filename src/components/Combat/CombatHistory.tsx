"use client";

import {
    Box,
    Stack,
    Typography,
    Card,
    CardContent,
    Chip,
    Collapse,
    CircularProgress,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Tooltip,
    Switch,
    FormControlLabel,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useCampaign } from "../../context/CampaignContext";
import { useAuth } from "../../context/AuthContext";
import { isNpc } from "../../lib/isNpc";

/* ===========================
   TYPES
=========================== */

type HpSnapshot = {
    round: number;
    turnIndex: number;
    data: Record<string, number>;
};

type CombatStat = {
    id: string;
    name: string;
    isNpc: boolean;
    totalDamage: number;
    totalHealing: number;
    hits: number;
    misses: number;
    maxHit: number;
};

type Participant = {
    character: {
        id: string;
        name: string;
        maxLife: number;
        ownerId?: string;
    };
};

type CombatSummary = {
    id: string;
    round: number;
    createdAt: string;
    hpSnapshots: HpSnapshot[];
    participants: Participant[];
    logs: { id: string; type: string; message: string; createdAt: string }[];
    stats: { rounds: number; participants: CombatStat[] };
};

/* ===========================
   CONSTANTS
=========================== */

const LOG_COLORS: Record<string, string> = {
    ROLL: "#fbbf24",
    DAMAGE: "#f87171",
    HEAL: "#4ade80",
    REACTION: "#60a5fa",
    COMBAT_START: "#f97316",
    COMBAT_END: "#f97316",
    DAMAGE_OVER_TIME: "#fb923c",
    HEAL_OVER_TIME: "#86efac",
    MANUAL_OVERRIDE: "#c084fc",
    TURN_START: "#6b7280",
    TURN_END: "#6b7280",
};

const LOG_LABELS: Record<string, string> = {
    ROLL: "Rolagem",
    DAMAGE: "Dano",
    HEAL: "Cura",
    REACTION: "Reação",
    COMBAT_START: "Início",
    COMBAT_END: "Fim",
    DAMAGE_OVER_TIME: "DoT",
    HEAL_OVER_TIME: "HoT",
    MANUAL_OVERRIDE: "Ajuste",
    TURN_START: "Turno↑",
    TURN_END: "Turno↓",
};

// Jogadores em azul, NPCs em laranja — par validado para CVD sobre fundo escuro
const TEAM_COLORS = { player: "#3987e5", npc: "#d95926" };
const DEATH_COLOR = "#e66767";

/* ===========================
   HP CHART — small multiples
   Um mini-gráfico por personagem, cada um na escala do próprio
   maxLife. Divisórias verticais marcam a virada de round; ✝ marca
   a queda a 0 HP; hover mostra round + valor.
=========================== */

type HpSeries = {
    id: string;
    name: string;
    npc: boolean;
    color: string;
    maxLife: number;
    // HP por snapshot; null = ainda não estava no combate
    values: (number | null)[];
    deathIdx: number | null;
    isDead: boolean;
    showExact: boolean;
};

function HpSparkCell({
    series,
    snapshots,
    roundStarts,
}: {
    series: HpSeries;
    snapshots: HpSnapshot[];
    roundStarts: number[];
}) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const W = 100;
    const H = 34;
    const n = snapshots.length;
    const maxLife = Math.max(series.maxLife, 1);

    const xOf = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const yOf = (hp: number) => 2 + (1 - Math.max(0, Math.min(hp / maxLife, 1))) * (H - 4);
    const xPct = (i: number) => `${((xOf(i) / W) * 100).toFixed(2)}%`;

    const pts = series.values
        .map((v, i) => (v == null ? null : { x: xOf(i), y: yOf(v), i }))
        .filter((p): p is { x: number; y: number; i: number } => p !== null);

    if (!pts.length) return null;

    const lineStr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const areaPath =
        `M ${pts[0].x.toFixed(2)},${H} ` +
        pts.map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") +
        ` L ${pts[pts.length - 1].x.toFixed(2)},${H} Z`;

    const finalHp = pts[pts.length - 1] ? (series.values[pts[pts.length - 1].i] ?? 0) : 0;
    const finalPct = Math.round((finalHp / maxLife) * 100);
    const hoverValue = hoverIdx != null ? series.values[hoverIdx] : null;
    const hoverRound = hoverIdx != null ? snapshots[hoverIdx]?.round : null;

    function handleMove(e: React.MouseEvent<SVGSVGElement>) {
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / Math.max(rect.width, 1);
        setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
    }

    const fmtHp = (v: number) =>
        series.showExact ? `${v}/${series.maxLife} HP` : `${Math.round((v / maxLife) * 100)}%`;

    return (
        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", opacity: series.isDead ? 0.8 : 1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5} mb={0.5}>
                <Stack direction="row" alignItems="center" spacing={0.6} minWidth={0}>
                    <Box sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: series.color, flexShrink: 0 }} />
                    <Typography fontSize={11} fontWeight={600} color="#ccc" noWrap>{series.name}</Typography>
                </Stack>
                <Typography fontSize={10} fontWeight={700} color={series.isDead ? DEATH_COLOR : "#999"} flexShrink={0}>
                    {series.isDead ? "✝ caiu" : series.showExact ? `${finalHp}/${series.maxLife}` : `${finalPct}%`}
                </Typography>
            </Stack>

            {/* Altura do SVG = altura do viewBox → só o eixo X estica; marcadores em HTML não distorcem */}
            <Box sx={{ position: "relative" }}>
                <svg
                    width="100%"
                    height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    style={{ display: "block", cursor: "crosshair" }}
                    onMouseMove={handleMove}
                    onMouseLeave={() => setHoverIdx(null)}
                >
                    {roundStarts.map((i) => (
                        <line key={i} x1={xOf(i)} x2={xOf(i)} y1={0} y2={H} stroke="#ffffff12" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    ))}
                    <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#2a2a3a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <path d={areaPath} fill={series.color} opacity={0.13} />
                    <polyline points={lineStr} fill="none" stroke={series.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    {hoverIdx != null && (
                        <line x1={xOf(hoverIdx)} x2={xOf(hoverIdx)} y1={0} y2={H} stroke="#ffffff40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    )}
                </svg>

                {/* Marcador de morte */}
                {series.deathIdx != null && (
                    <Box sx={{ position: "absolute", left: xPct(series.deathIdx), top: yOf(0), width: 7, height: 7, borderRadius: "50%", bgcolor: DEATH_COLOR, border: "1.5px solid #14141f", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
                )}

                {/* Ponto do hover */}
                {hoverIdx != null && hoverValue != null && (
                    <Box sx={{ position: "absolute", left: xPct(hoverIdx), top: yOf(hoverValue), width: 7, height: 7, borderRadius: "50%", bgcolor: series.color, border: "1.5px solid #14141f", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
                )}

                {/* Tooltip */}
                {hoverIdx != null && (
                    <Box sx={{ position: "absolute", bottom: H + 2, left: "50%", transform: "translateX(-50%)", px: 0.75, py: 0.25, borderRadius: 1, bgcolor: "#0b0b14", border: "1px solid #333", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 5 }}>
                        <Typography fontSize={10} color="#ddd" sx={{ fontFamily: "monospace" }}>
                            R{hoverRound} · {hoverValue == null ? "fora do combate" : fmtHp(hoverValue)}
                        </Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

function HpChart({
    snapshots,
    participants,
    hideNpcs,
    masterId,
    viewerIsMaster,
}: {
    snapshots: HpSnapshot[];
    participants: Participant[];
    hideNpcs: boolean;
    masterId: string | null;
    viewerIsMaster: boolean;
}) {
    const visibleParticipants = hideNpcs
        ? participants.filter((p) => !isNpc(p.character, masterId))
        : participants;

    if (!snapshots.length || !visibleParticipants.length) return null;

    // Índices onde o round vira (divisórias verticais dos mini-gráficos)
    const roundStarts = snapshots
        .map((s, i) => (i > 0 && s.round !== snapshots[i - 1].round ? i : -1))
        .filter((i) => i > 0);

    const series: HpSeries[] = visibleParticipants
        .map((p) => {
            const raw = snapshots.map((s) => s.data[p.character.id] as number | undefined);
            const firstIdx = raw.findIndex((v) => v !== undefined);
            // Antes de entrar no combate = null; buraco no meio repete o último valor
            let last: number | null = null;
            const values = raw.map((v, i) => {
                if (firstIdx === -1 || i < firstIdx) return null;
                if (v !== undefined) last = v;
                return last;
            });
            const npc = isNpc(p.character, masterId);
            const deathIdx = values.findIndex((v) => v != null && v <= 0);
            const lastValue = [...values].reverse().find((v) => v != null) ?? null;
            return {
                id: p.character.id,
                name: p.character.name,
                npc,
                color: npc ? TEAM_COLORS.npc : TEAM_COLORS.player,
                maxLife: p.character.maxLife,
                values,
                deathIdx: deathIdx === -1 ? null : deathIdx,
                isDead: lastValue != null && lastValue <= 0,
                showExact: viewerIsMaster || !npc,
            };
        })
        .filter((s) => s.values.some((v) => v != null))
        .sort((a, b) => Number(a.npc) - Number(b.npc) || a.name.localeCompare(b.name));

    if (!series.length) return null;

    const totalRounds = snapshots[snapshots.length - 1]?.round ?? 1;
    const hasNpcSeries = series.some((s) => s.npc);
    const hasDeath = series.some((s) => s.deathIdx != null);

    return (
        <Box sx={{ mt: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={0.75} flexWrap="wrap">
                <Typography fontSize={11} color="#666" sx={{ flex: 1, minWidth: 140 }}>
                    HP ao longo do combate · {totalRounds} round(s)
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Box sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: TEAM_COLORS.player }} />
                    <Typography fontSize={10} color="#888">Jogadores</Typography>
                </Stack>
                {hasNpcSeries && (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Box sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: TEAM_COLORS.npc }} />
                        <Typography fontSize={10} color="#888">NPCs</Typography>
                    </Stack>
                )}
                {hasDeath && (
                    <Typography fontSize={10} color={DEATH_COLOR}>✝ caiu a 0 HP</Typography>
                )}
            </Stack>

            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}>
                {series.map((s) => (
                    <HpSparkCell key={s.id} series={s} snapshots={snapshots} roundStarts={roundStarts} />
                ))}
            </Box>
        </Box>
    );
}

/* ===========================
   STATS TABLE
=========================== */

function StatsTable({ stats, hideNpcs }: { stats: CombatSummary["stats"]; hideNpcs: boolean }) {
    if (!stats?.participants?.length) return null;

    const visible = hideNpcs
        ? stats.participants.filter((p) => !p.isNpc)
        : stats.participants;

    if (!visible.length) return null;

    const maxDamage = Math.max(...visible.map((p) => p.totalDamage), 1);
    const sorted = [...visible].sort((a, b) => b.totalDamage - a.totalDamage);

    return (
        <Box sx={{ mt: 1.5, overflowX: "auto" }}>
            <Typography fontSize={11} color="#666" mb={0.5}>Estatísticas</Typography>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                    <tr>
                        {["Personagem", "Acertos", "Erros", "Dano Total", "Cura Total", "Maior Hit"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "3px 6px", color: "#666", borderBottom: "1px solid #2a2a3a" }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((p) => (
                        <tr key={p.id}>
                            <td style={{ padding: "4px 6px", color: "#ddd" }}>{p.name}</td>
                            <td style={{ padding: "4px 6px", color: "#4ade80" }}>{p.hits}</td>
                            <td style={{ padding: "4px 6px", color: "#f87171" }}>{p.misses}</td>
                            <td style={{ padding: "4px 6px", color: "#fbbf24", fontWeight: 700 }}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <span>{p.totalDamage}</span>
                                    {p.totalDamage > 0 && (
                                        <Box sx={{ height: 4, width: Math.max(4, Math.round((p.totalDamage / maxDamage) * 56)), bgcolor: "#fbbf2450", borderRadius: 2, flexShrink: 0 }} />
                                    )}
                                </Stack>
                            </td>
                            <td style={{ padding: "4px 6px", color: "#4ade80" }}>
                                {(p.totalHealing ?? 0) > 0 ? p.totalHealing : "—"}
                            </td>
                            <td style={{ padding: "4px 6px", color: "#f97316" }}>{p.maxHit || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Box>
    );
}

/* ===========================
   COMBAT CARD
=========================== */

function CombatCard({
    combat,
    hideNpcs,
    onDelete,
    masterId,
    viewerIsMaster,
}: {
    combat: CombatSummary;
    hideNpcs: boolean;
    onDelete: (id: string) => void;
    masterId: string | null;
    viewerIsMaster: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const visibleParticipants = hideNpcs
        ? combat.participants.filter((p) => !isNpc(p.character, masterId))
        : combat.participants;

    const hiddenNpcCount = hideNpcs
        ? combat.participants.filter((p) => isNpc(p.character, masterId)).length
        : 0;

    const logTypes = Array.from(new Set(combat.logs.map((l) => l.type)));
    const filteredLogs = activeTypes.size === 0 ? combat.logs : combat.logs.filter((l) => activeTypes.has(l.type));

    function toggleType(type: string) {
        setActiveTypes((prev) => {
            const next = new Set(prev);
            next.has(type) ? next.delete(type) : next.add(type);
            return next;
        });
    }

    function exportLog() {
        const lines = combat.logs.map((l) => `[${l.type}] ${l.message}`).join("\n");
        const blob = new Blob(
            [`=== Combate (Round ${combat.round}) — ${new Date(combat.createdAt).toLocaleString()} ===\n\n${lines}`],
            { type: "text/plain" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `historico-combate-${combat.id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function handleDelete() {
        setDeleting(true);
        try {
            await api.delete(`/combat/${combat.id}`);
            onDelete(combat.id);
        } finally {
            setDeleting(false);
            setConfirmDelete(false);
        }
    }

    return (
        <>
            <Card
                sx={{
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 2,
                    transition: "border-color 0.2s",
                    "&:hover": { borderColor: "rgba(255,255,255,0.14)" },
                }}
            >
                <CardContent>
                    {/* Header */}
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        onClick={() => setIsOpen((v) => !v)}
                        sx={{ cursor: "pointer" }}
                    >
                        <Stack spacing={0.5}>
                            <Typography fontWeight={700} fontSize={13}>
                                {new Date(combat.createdAt).toLocaleString("pt-BR", {
                                    day: "2-digit", month: "2-digit", year: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                })}
                                <Typography component="span" fontSize={12} color="#666" ml={1}>
                                    · {combat.round} rounds
                                </Typography>
                            </Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center">
                                {visibleParticipants.map((p) => (
                                    <Chip
                                        key={p.character.id}
                                        label={p.character.name}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: 10, height: 18, borderColor: "#333", color: "#aaa" }}
                                    />
                                ))}
                                {hiddenNpcCount > 0 && (
                                    <Typography fontSize={10} color="#444" fontStyle="italic">
                                        +{hiddenNpcCount} NPC(s)
                                    </Typography>
                                )}
                            </Stack>
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                            <Tooltip title="Exportar log (.txt)">
                                <IconButton size="small" onClick={exportLog} sx={{ color: "#555", "&:hover": { color: "#aaa" } }}>
                                    ⬇
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Excluir combate">
                                <IconButton size="small" onClick={() => setConfirmDelete(true)} sx={{ color: "#555", "&:hover": { color: "#f87171" } }}>
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                            <IconButton
                                size="small"
                                onClick={() => setIsOpen((v) => !v)}
                                sx={{ color: "#666", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                            >
                                <ExpandMoreIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>

                    {/* Expanded content */}
                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box mt={1.5}>
                            {combat.hpSnapshots?.length > 0 && (
                                <HpChart
                                    snapshots={combat.hpSnapshots}
                                    participants={combat.participants}
                                    hideNpcs={hideNpcs}
                                    masterId={masterId}
                                    viewerIsMaster={viewerIsMaster}
                                />
                            )}

                            <StatsTable stats={combat.stats} hideNpcs={hideNpcs} />

                            {/* Log section */}
                            <Box mt={1.5}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5} mb={0.75}>
                                    <Typography fontSize={11} color="#666">
                                        Log de ações
                                        {activeTypes.size > 0 && (
                                            <Typography
                                                component="span" fontSize={10} color="#4fc3f7" ml={1}
                                                sx={{ cursor: "pointer" }}
                                                onClick={() => setActiveTypes(new Set())}
                                            >
                                                (limpar filtro)
                                            </Typography>
                                        )}
                                    </Typography>
                                    {logTypes.length > 0 && (
                                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                            {logTypes.map((type) => {
                                                const active = activeTypes.has(type);
                                                const color = LOG_COLORS[type] ?? "#888";
                                                return (
                                                    <Chip
                                                        key={type}
                                                        label={LOG_LABELS[type] ?? type}
                                                        size="small"
                                                        onClick={() => toggleType(type)}
                                                        sx={{
                                                            fontSize: 9, height: 18, cursor: "pointer",
                                                            bgcolor: active ? `${color}25` : "transparent",
                                                            border: `1px solid ${active ? color : "#333"}`,
                                                            color: active ? color : "#666",
                                                            "&:hover": { bgcolor: `${color}18` },
                                                        }}
                                                    />
                                                );
                                            })}
                                        </Stack>
                                    )}
                                </Stack>

                                <Stack spacing={0.4} sx={{ maxHeight: 320, overflowY: "auto" }}>
                                    {filteredLogs.map((log) => (
                                        <Box
                                            key={log.id}
                                            sx={{
                                                px: 1, py: "3px", borderRadius: 0.75,
                                                borderLeft: `3px solid ${LOG_COLORS[log.type] ?? "#555"}`,
                                                backgroundColor: `${LOG_COLORS[log.type] ?? "#555"}08`,
                                            }}
                                        >
                                            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "#ccc", fontSize: 11, lineHeight: 1.4 }}>
                                                [{log.type}] {log.message}
                                            </Typography>
                                        </Box>
                                    ))}
                                    {filteredLogs.length === 0 && (
                                        <Typography variant="caption" color="#555">
                                            {activeTypes.size > 0 ? "Nenhum log para o filtro selecionado." : "Sem logs registrados."}
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>
                        </Box>
                    </Collapse>
                </CardContent>
            </Card>

            {/* Confirm delete dialog */}
            <Dialog open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ color: "#f87171", pb: 1 }}>Excluir combate?</DialogTitle>
                <DialogContent>
                    <Typography fontSize={13} color="#aaa">
                        Todos os logs, rolagens e participantes serão removidos permanentemente.
                    </Typography>
                    <Typography fontSize={12} color="#555" mt={1}>
                        {new Date(combat.createdAt).toLocaleString("pt-BR")} · {combat.round} rounds ·{" "}
                        {combat.participants.map((p) => p.character.name).join(", ")}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(false)} color="inherit" disabled={deleting}>Cancelar</Button>
                    <Button variant="contained" color="error" disabled={deleting} onClick={handleDelete}>
                        {deleting ? <CircularProgress size={14} sx={{ mr: 0.75 }} /> : null}
                        Excluir
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

/* ===========================
   COMBAT HISTORY (root)
=========================== */

export function CombatHistory() {
    const [combats, setCombats] = useState<CombatSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [hideNpcs, setHideNpcs] = useState(false);
    const { activeCampaign } = useCampaign();
    const { user } = useAuth();
    const masterId = activeCampaign?.masterId ?? null;
    const viewerIsMaster = !!user?.id && user.id === masterId;

    useEffect(() => {
        api.get("/combat/history")
            .then((res) => setCombats(res.data.combats ?? []))
            .catch(() => setCombats([]))
            .finally(() => setLoading(false));
    }, []);

    function handleDelete(id: string) {
        setCombats((prev) => prev.filter((c) => c.id !== id));
    }

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
            </Box>
        );
    }

    if (combats.length === 0) {
        return (
            <Box p={4} textAlign="center">
                <Typography color="#666">Nenhum combate encerrado encontrado.</Typography>
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            {/* Toolbar */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography fontSize={12} color="#555">
                    {combats.length} combate(s) encerrado(s)
                </Typography>
                <FormControlLabel
                    control={
                        <Switch
                            size="small"
                            checked={hideNpcs}
                            onChange={(e) => setHideNpcs(e.target.checked)}
                            sx={{
                                "& .MuiSwitch-switchBase.Mui-checked": { color: "#4fc3f7" },
                                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#4fc3f740" },
                            }}
                        />
                    }
                    label={
                        <Typography fontSize={12} color={hideNpcs ? "#4fc3f7" : "#666"}>
                            Ocultar NPCs
                        </Typography>
                    }
                    labelPlacement="start"
                    sx={{ m: 0, gap: 0.75 }}
                />
            </Stack>

            {/* Combat list */}
            <Stack spacing={1.5}>
                {combats.map((combat) => (
                    <CombatCard key={combat.id} combat={combat} hideNpcs={hideNpcs} onDelete={handleDelete} masterId={masterId} viewerIsMaster={viewerIsMaster} />
                ))}
            </Stack>
        </Stack>
    );
}
