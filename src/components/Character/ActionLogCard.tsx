import { Stack, Card, CardContent, Typography, Box, Chip } from "@mui/material";
import { ActionLog } from "../../types/types";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { useState } from "react";
import { RollBreakdown } from "../Log/RollBreakdown";

const LOG_STYLE: Record<string, { color: string }> = {
  DAMAGE:           { color: "#f87171" },
  HEAL:             { color: "#4ade80" },
  ROLL:             { color: "#fbbf24" },
  REACTION:         { color: "#60a5fa" },
  DAMAGE_OVER_TIME: { color: "#fb923c" },
  HEAL_OVER_TIME:   { color: "#86efac" },
  MANUAL_OVERRIDE:  { color: "#c084fc" },
};

const SKIP_TYPES = new Set(["TURN_START", "TURN_END", "COMBAT_START", "COMBAT_END"]);

type Props = {
  actionLog: ActionLog;
};

export function ActionLogCard({ actionLog }: Props) {
  const [hovering, setHovering] = useState(false);

  if (SKIP_TYPES.has(actionLog.type)) return null;

  const { color } = LOG_STYLE[actionLog.type] ?? { color: "#6B7ADB" };

  const roll = actionLog.roll;
  const succeeded = roll?.success ?? roll?.sucess ?? undefined;
  const isCritical = roll?.critical ?? false;
  const hasDamage = (roll?.damage ?? 0) > 0;
  const hasHealing = (roll?.healing ?? 0) > 0;

  // Compute attack modifier (attribute portion) and damage modifier for breakdown
  let damageRolls: number[] | undefined;
  let damageModifier = 0;

  if (roll?.damage && roll?.preset?.impactFormula) {
    const impactRollsData = roll.impactRolls;
    if (impactRollsData && impactRollsData.length > 0) {
      damageRolls = impactRollsData;
      const impactDiceSum = impactRollsData.reduce((a, b) => a + b, 0);
      damageModifier = Math.max(0, roll.damage - impactDiceSum);
    }
  }

  return (
    <Card
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: `2px solid ${hovering ? color : `${color}40`}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 2,
        transition: "all 0.2s",
        boxShadow: hovering ? `0 4px 16px ${color}30` : "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        {/* Header row */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} mb={roll ? 1 : 0}>
          <Typography variant="body2" fontWeight="600" sx={{ flex: 1, lineHeight: 1.4 }}>
            {actionLog.message}
          </Typography>

          <Stack direction="row" spacing={0.5} flexShrink={0} alignItems="center">
            {isCritical && (
              <Chip
                icon={<LocalFireDepartmentIcon sx={{ fontSize: "0.85rem !important" }} />}
                label="Crítico"
                size="small"
                sx={{ backgroundColor: "#f97316", color: "white", fontWeight: 700, height: 22, fontSize: 10 }}
              />
            )}

            {succeeded === true && (
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: "0.85rem !important" }} />}
                label="Acertou"
                size="small"
                sx={{ backgroundColor: "#4ade8020", color: "#4ade80", fontWeight: 700, height: 22, fontSize: 10 }}
              />
            )}

            {succeeded === false && (
              <Chip
                icon={<CancelIcon sx={{ fontSize: "0.85rem !important" }} />}
                label="Falhou"
                size="small"
                sx={{ backgroundColor: "#f8717120", color: "#f87171", fontWeight: 700, height: 22, fontSize: 10 }}
              />
            )}
          </Stack>
        </Stack>

        {/* Damage / Healing badges */}
        {(hasDamage || hasHealing) && (
          <Stack direction="row" spacing={1} mb={roll ? 1 : 0}>
            {hasDamage && (
              <Box sx={{ px: 1, py: 0.25, backgroundColor: "#f8717120", borderRadius: 1, border: "1px solid #f8717140" }}>
                <Typography variant="caption" sx={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                  🗡 {roll!.damage} de dano
                </Typography>
              </Box>
            )}
            {hasHealing && (
              <Box sx={{ px: 1, py: 0.25, backgroundColor: "#4ade8020", borderRadius: 1, border: "1px solid #4ade8040" }}>
                <Typography variant="caption" sx={{ color: "#4ade80", fontWeight: 700, fontFamily: "monospace" }}>
                  💚 {roll!.healing} de cura
                </Typography>
              </Box>
            )}
          </Stack>
        )}

        {/* Target info */}
        {actionLog.target && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: roll ? 1 : 0 }}>
            Alvo: <span style={{ color: "#ddd" }}>{actionLog.target.name}</span>
          </Typography>
        )}

        {/* Dice breakdown */}
        {roll && roll.rolls && roll.rolls.length > 0 && (
          <Box sx={{ backgroundColor: "#1a1a2e40", p: 1.5, borderRadius: 1.5, border: "1px solid rgba(255,255,255,0.06)" }}>
            <RollBreakdown
              roll={roll}
              succeeded={typeof succeeded === "boolean" ? succeeded : undefined}
              showDamage={hasDamage || hasHealing}
              damageRolls={damageRolls}
              damageModifier={damageModifier}
            />
          </Box>
        )}

        {/* Preset name */}
        {roll?.preset?.name && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            Habilidade: <span style={{ color: "#aaa" }}>{roll.preset.name}</span>
          </Typography>
        )}
        {roll?.skillLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            Perícia: <span style={{ color: "#aaa" }}>{roll.skillLabel}</span>
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
