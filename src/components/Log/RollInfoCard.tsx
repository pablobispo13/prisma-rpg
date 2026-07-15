"use client";

import { Card, CardContent, Stack, Typography, Box, Chip } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";

interface RollInfoCardProps {
  characterName: string;
  actionName?: string;
  actionType?: string;
  diceFormula: string;
  diceRolls: number[];
  modifier: number;
  total: number;
  critical?: boolean;
  succeeded?: boolean;
  damage?: number | null;
  healing?: number | null;
  impactRolls?: number[];
  impactFormula?: string | null;
  targetDefense?: number | null;
  timestamp?: string;
  compact?: boolean;
}

export function RollInfoCard({
  characterName,
  actionName,
  actionType,
  diceFormula,
  diceRolls,
  modifier,
  total,
  critical = false,
  succeeded,
  damage,
  healing,
  impactRolls,
  impactFormula,
  targetDefense,
  timestamp,
  compact = false,
}: RollInfoCardProps) {
  const diceSum = diceRolls.reduce((a, b) => a + b, 0);
  // `modifier` já é o modificador puro (atributo + bônus), salvo separado dos dados
  const modifierValue = modifier;
  const modifierText = modifierValue > 0 ? `+${modifierValue}` : `${modifierValue}`;
  const isD20 = /d20/i.test(diceFormula);
  const dieColor = (v: number) =>
    isD20 && v === 20 ? "#4ade80" : isD20 && v === 1 ? "#f87171" : "#60a5fa";
  const impactSum = impactRolls?.reduce((a, b) => a + b, 0) ?? 0;

  let successColor = "#888";
  let successIcon = null;
  let statusLabel = "";

  if (succeeded === true) {
    successColor = "#4ade80";
    successIcon = <CheckCircleIcon />;
    statusLabel = "Acertou";
  } else if (succeeded === false) {
    successColor = "#f87171";
    successIcon = <CancelIcon />;
    statusLabel = "Falhou";
  }

  return (
    <Card
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: critical ? "2px solid #f97316" : "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 2,
        transition: "all 0.2s",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderColor: "rgba(255, 255, 255, 0.2)",
        },
      }}
    >
      <CardContent sx={{ p: compact ? 1.5 : 2, "&:last-child": { pb: compact ? 1.5 : 2 } }}>
        <Stack spacing={1.5}>
          {/* Header: Personagem + Ação */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box flex={1} minWidth={0}>
              <Typography fontWeight="bold" variant={compact ? "body2" : "subtitle2"}>
                {characterName}
              </Typography>
              {actionName && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: "monospace" }}
                  noWrap
                >
                  {actionName} {actionType && `• ${actionType}`}
                </Typography>
              )}
            </Box>

            {statusLabel && (
              <Chip
                {...(successIcon && { icon: successIcon })}
                label={statusLabel}
                size="small"
                sx={{
                  backgroundColor: `${successColor}20`,
                  color: successColor,
                  fontWeight: "bold",
                  ml: 1,
                }}
              />
            )}

            {critical && (
              <Chip
                icon={<LocalFireDepartmentIcon />}
                label="Crítico"
                size="small"
                sx={{
                  backgroundColor: "#f97316",
                  color: "white",
                  fontWeight: "bold",
                  ml: 1,
                }}
              />
            )}
          </Stack>

          {/* Dice Breakdown */}
          <Box
            sx={{
              fontFamily: "monospace",
              fontSize: compact ? 11 : 12,
              backgroundColor: "#1a1a2e",
              p: compact ? 1 : 1.5,
              borderRadius: 1,
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <Stack spacing={compact ? 0.3 : 0.5}>
              {/* Equação completa: 1d20 (19) +15 = 34 */}
              <Typography sx={{ fontFamily: "monospace" }}>
                <span style={{ color: "#fbbf24" }}>{diceFormula}</span>
                {" ("}
                {diceRolls.map((v, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    <span style={{ color: dieColor(v), fontWeight: 700 }}>{v}</span>
                  </span>
                ))}
                {")"}
                {modifierValue !== 0 && (
                  <span style={{ color: "#a78bfa" }}> {modifierText}</span>
                )}
                {" = "}
                <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: compact ? 12 : 14 }}>{total}</span>
              </Typography>

              {/* Breakdown */}
              <Stack spacing={compact ? 0.2 : 0.3} sx={{ pl: 1.5, borderLeft: "2px solid #374151" }}>
                <Typography sx={{ fontFamily: "monospace", fontSize: compact ? 10 : 11 }}>
                  ├─ Dado: <span style={{ color: "#4ade80" }}>{diceSum}</span>
                </Typography>

                {modifierValue !== 0 && (
                  <Typography sx={{ fontFamily: "monospace", fontSize: compact ? 10 : 11 }}>
                    ├─ Modificador: <span style={{ color: "#a78bfa" }}>{modifierText}</span>
                  </Typography>
                )}

                {targetDefense !== undefined && (
                  <Typography sx={{ fontFamily: "monospace", fontSize: compact ? 10 : 11 }}>
                    ├─ Vs Defesa: <span style={{ color: "#60a5fa" }}>{targetDefense}</span>
                  </Typography>
                )}

                <Typography sx={{ fontFamily: "monospace", fontWeight: "bold", fontSize: compact ? 11 : 12 }}>
                  └─ TOTAL: <span style={{ color: "#fbbf24" }}>{total}</span>
                </Typography>
              </Stack>
            </Stack>
          </Box>

          {/* Damage breakdown */}
          {damage && damage > 0 && (
            <Box sx={{ p: compact ? 1 : 1.5, backgroundColor: "#f8717120", borderRadius: 1, border: "1px solid #f8717140" }}>
              <Stack spacing={compact ? 0.2 : 0.4}>
                <Typography variant="caption" sx={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                  🗡️ Dano: {damage}
                </Typography>
                {impactRolls && impactRolls.length > 0 && (
                  <Typography sx={{ fontFamily: "monospace", fontSize: compact ? 10 : 11, color: "#fca5a5", pl: 1.5, borderLeft: "2px solid #f87171" }}>
                    {impactFormula ?? "dados"} ({impactRolls.join(", ")})
                    {damage! - impactSum > 0 && ` +${damage! - impactSum}`}
                    {" = "}{damage}
                    {critical && " (com crítico)"}
                  </Typography>
                )}
              </Stack>
            </Box>
          )}

          {/* Healing breakdown */}
          {healing && healing > 0 && (
            <Box sx={{ p: compact ? 1 : 1.5, backgroundColor: "#4ade8020", borderRadius: 1, border: "1px solid #4ade8040" }}>
              <Stack spacing={compact ? 0.2 : 0.4}>
                <Typography variant="caption" sx={{ color: "#4ade80", fontWeight: 700, fontFamily: "monospace" }}>
                  💚 Cura: {healing}
                </Typography>
                {impactRolls && impactRolls.length > 0 && (
                  <Typography sx={{ fontFamily: "monospace", fontSize: compact ? 10 : 11, color: "#86efac", pl: 1.5, borderLeft: "2px solid #4ade80" }}>
                    {impactFormula ?? "dados"} ({impactRolls.join(", ")})
                    {healing! - impactSum > 0 && ` +${healing! - impactSum}`}
                    {" = "}{healing}
                  </Typography>
                )}
              </Stack>
            </Box>
          )}

          {/* Timestamp */}
          {timestamp && !compact && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {new Date(timestamp).toLocaleString()}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
