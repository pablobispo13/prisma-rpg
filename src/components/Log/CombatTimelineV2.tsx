"use client";

import { Stack, Box, Typography, Chip, Collapse, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useState, useMemo } from "react";
import { ActionLog } from "../../types/types";
import { RollBreakdown } from "./RollBreakdown";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

const SKIP_TYPES = new Set(["TURN_START", "TURN_END", "COMBAT_START", "COMBAT_END"]);

const INLINE_STYLE: Record<string, { color: string; icon: string }> = {
  DAMAGE_OVER_TIME: { color: "#fb923c", icon: "☠" },
  HEAL_OVER_TIME:   { color: "#86efac", icon: "💚" },
  MANUAL_OVERRIDE:  { color: "#c084fc", icon: "⚙" },
};

interface CombatTimelineV2Props {
  logs: ActionLog[];
}

type DisplayItem =
  | { kind: "group"; key: string; logs: ActionLog[] }
  | { kind: "inline"; log: ActionLog };

export function CombatTimelineV2({ logs }: CombatTimelineV2Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const items = useMemo<DisplayItem[]>(() => {
    // Build a map: rollId → all logs for that roll
    const rollMap = new Map<string, ActionLog[]>();
    for (const log of logs) {
      if (log.roll?.id) {
        if (!rollMap.has(log.roll.id)) rollMap.set(log.roll.id, []);
        rollMap.get(log.roll.id)!.push(log);
      }
    }

    // Walk newest-first, emit each group/inline once
    const seen = new Set<string>();
    const result: DisplayItem[] = [];

    for (const log of [...logs].reverse()) {
      if (SKIP_TYPES.has(log.type)) continue;

      if (log.roll?.id) {
        const rollId = log.roll.id;
        if (!seen.has(rollId)) {
          seen.add(rollId);
          result.push({ kind: "group", key: rollId, logs: rollMap.get(rollId)! });
        }
      } else {
        if (!seen.has(log.id)) {
          seen.add(log.id);
          result.push({ kind: "inline", log });
        }
      }
    }

    return result;
  }, [logs]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (!items.length) {
    return (
      <Typography variant="caption" color="#555" sx={{ p: 1, display: "block" }}>
        Nenhuma ação registrada.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {items.map((item) => {
        if (item.kind === "inline") {
          const style = INLINE_STYLE[item.log.type];
          if (!style) return null;
          return (
            <Box
              key={item.log.id}
              sx={{
                px: 1.5, py: 0.75,
                borderLeft: `3px solid ${style.color}`,
                backgroundColor: `${style.color}12`,
                borderRadius: "0 6px 6px 0",
              }}
            >
              <Typography variant="caption" sx={{ color: style.color, fontFamily: "monospace" }}>
                {style.icon} {item.log.message}
              </Typography>
            </Box>
          );
        }

        // --- ROLL GROUP ---
        const { key, logs: groupLogs } = item;
        const mainLog  = groupLogs.find((l) => l.type === "ROLL") ?? groupLogs[0];
        const dmgLog   = groupLogs.find((l) => l.type === "DAMAGE");
        const healLog  = groupLogs.find((l) => l.type === "HEAL");
        const reactLogs = groupLogs.filter((l) => l.type === "REACTION");
        // Efeitos aplicados nesta mesma rolagem (controle, buff, DoT/HoT
        // inicial etc.) — sem isso, ficavam registrados no banco mas somem
        // da timeline por caírem no mesmo grupo da rolagem principal
        const effectLogs = groupLogs.filter((l) => l.type === "MANUAL_OVERRIDE");

        const roll = mainLog.roll;
        const succeeded = roll?.success ?? roll?.sucess;
        const isCritical = roll?.critical ?? false;
        const damage  = (roll?.damage ?? 0) > 0 ? roll!.damage : null;
        const healing = (roll?.healing ?? 0) > 0 ? roll!.healing : null;
        const hasRolls = (roll?.rolls?.length ?? 0) > 0;
        const isOpen = expanded.has(key);

        // Bonus shown inline = roll.modifier (attribute + flat, already separated from dice)
        const bonus = roll?.modifier ?? 0;
        const diceSum = roll?.rolls?.reduce((a, b) => a + b, 0) ?? 0;
        const modifierDisplay = bonus > 0 ? ` +${bonus}` : bonus < 0 ? ` ${bonus}` : "";

        return (
          <Box
            key={key}
            sx={{
              borderRadius: 1.5,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.07)",
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            {/* Header row */}
            <Box
              onClick={() => hasRolls && toggle(key)}
              sx={{
                px: 1.5, py: 1,
                cursor: hasRolls ? "pointer" : "default",
                display: "flex", alignItems: "flex-start", gap: 1,
                "&:hover": hasRolls ? { backgroundColor: "rgba(255,255,255,0.03)" } : {},
              }}
            >
              {/* Expand toggle */}
              <Box sx={{ pt: 0.25, flexShrink: 0 }}>
                {hasRolls ? (
                  <IconButton size="small" sx={{ p: 0 }}>
                    <ExpandMoreIcon
                      sx={{ fontSize: 16, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }}
                    />
                  </IconButton>
                ) : (
                  <Box sx={{ width: 20 }} />
                )}
              </Box>

              {/* Text block */}
              <Stack flex={1} spacing={0.3} minWidth={0}>
                {/* Sub-header: Character → Target [Preset] */}
                {(mainLog.character || mainLog.target || roll?.preset?.name) && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1 }}>
                    {mainLog.character?.name}
                    {mainLog.target && ` → ${mainLog.target.name}`}
                    {roll?.preset?.name && ` · ${roll.preset.name}`}
                  </Typography>
                )}

                {/* Main message */}
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
                  {mainLog.message}
                </Typography>

                {/* Compact dice summary — hidden when expanded */}
                {hasRolls && !isOpen && (
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", fontSize: 10, color: "#777", lineHeight: 1 }}
                  >
                    {roll!.diceRolled} ({roll!.rolls!.join(", ")})
                    {modifierDisplay}
                    {" = "}
                    <span style={{ color: "#fbbf24", fontWeight: 700 }}>{roll!.total}</span>
                  </Typography>
                )}

                {/* Reaction result lines */}
                {reactLogs.map((rl) => (
                  <Typography key={rl.id} variant="caption" sx={{ color: "#60a5fa", fontSize: 10 }}>
                    ⚡ {rl.message}
                  </Typography>
                ))}

                {/* Damage / heal result line from related logs */}
                {(dmgLog || healLog) && (
                  <Typography variant="caption" sx={{ fontSize: 10, color: "#aaa" }}>
                    {dmgLog?.message}
                    {healLog?.message}
                  </Typography>
                )}

                {/* Efeitos aplicados por esta ação (controle, buff/debuff, DoT/HoT) */}
                {effectLogs.map((el) => (
                  <Typography key={el.id} variant="caption" sx={{ color: "#c084fc", fontSize: 10 }}>
                    ⚙ {el.message}
                  </Typography>
                ))}
              </Stack>

              {/* Chips */}
              <Stack direction="row" spacing={0.5} flexShrink={0} alignItems="center" sx={{ pt: 0.25 }}>
                {isCritical && (
                  <Chip
                    icon={<LocalFireDepartmentIcon sx={{ fontSize: "0.7rem !important" }} />}
                    label="Crit"
                    size="small"
                    sx={{ height: 18, fontSize: 9, backgroundColor: "#f97316", color: "white", "& .MuiChip-label": { px: 0.75 } }}
                  />
                )}
                {succeeded === true && (
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: "0.7rem !important" }} />}
                    label="✓"
                    size="small"
                    sx={{ height: 18, fontSize: 9, backgroundColor: "#4ade8020", color: "#4ade80", "& .MuiChip-label": { px: 0.5 } }}
                  />
                )}
                {succeeded === false && (
                  <Chip
                    icon={<CancelIcon sx={{ fontSize: "0.7rem !important" }} />}
                    label="✗"
                    size="small"
                    sx={{ height: 18, fontSize: 9, backgroundColor: "#f8717120", color: "#f87171", "& .MuiChip-label": { px: 0.5 } }}
                  />
                )}
                {(damage ?? 0) > 0 && (
                  <Chip
                    label={`🗡 ${damage}`}
                    size="small"
                    sx={{ height: 18, fontSize: 9, backgroundColor: "#f8717120", color: "#f87171", "& .MuiChip-label": { px: 0.75 } }}
                  />
                )}
                {(healing ?? 0) > 0 && (
                  <Chip
                    label={`💚 ${healing}`}
                    size="small"
                    sx={{ height: 18, fontSize: 9, backgroundColor: "#4ade8020", color: "#4ade80", "& .MuiChip-label": { px: 0.75 } }}
                  />
                )}
              </Stack>
            </Box>

            {/* Expanded: full dice breakdown */}
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              {roll && hasRolls && (
                <Box
                  sx={{
                    px: 1.5, py: 1.25,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    backgroundColor: "#1a1a2e50",
                  }}
                >
                  <RollBreakdown
                    roll={roll}
                    succeeded={typeof succeeded === "boolean" ? succeeded : undefined}
                    showDamage={(damage ?? 0) > 0 || (healing ?? 0) > 0}
                  />
                </Box>
              )}
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
}
