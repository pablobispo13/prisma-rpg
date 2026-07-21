"use client";

import {
  Stack,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Collapse,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { ActionPreset, TargetType } from "@prisma/client";
import { ActionPresetType } from "../../types/types";
import { useState } from "react";
import {
  getActionColor,
  getActionIcon,
  getActionName,
  getTargetName,
  formatPresetDisplay,
} from "../../lib/presetUtils";
import { DamageCalculator } from "./DamageCalculator";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

type Props = {
  preset: ActionPreset | ActionPresetType;
  characterAttribute?: number;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  actionButton?: React.ReactNode;
};

export function PresetCard({
  preset,
  characterAttribute = 0,
  canEdit = false,
  onEdit,
  onDelete,
  actionButton,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const color = getActionColor(preset.type);
  const icon = getActionIcon(preset.type);
  const actionName = getActionName(preset.type);
  const targetName = getTargetName(preset.targetType as TargetType);

  const displayText = formatPresetDisplay(
    preset.diceFormula,
    preset.impactFormula,
    preset.modifier,
    characterAttribute,
    preset.attribute,
  );

  return (
    <>
      <Card
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        sx={{
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          border: `2px solid ${hovering ? color : "rgba(255, 255, 255, 0.1)"}`,
          borderRadius: { xs: 1.5, sm: 2 },
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: hovering
            ? `0 8px 24px ${color}40`
            : "0 2px 8px rgba(0, 0, 0, 0.3)",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <CardContent
          sx={{
            p: { xs: 1.5, sm: 2 },
            "&:last-child": { pb: { xs: 1.5, sm: 2 } },
          }}
        >
          {/* Header */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={{ xs: 1, sm: 1.5 }}
            mb={1}
          >
            <Box
              sx={{
                fontSize: { xs: "1.2rem", sm: "1.5rem" },
                width: { xs: 28, sm: 32 },
                height: { xs: 28, sm: 32 },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${color}20`,
                borderRadius: 1,
                border: `1px solid ${color}40`,
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>

            <Stack flex={1} minWidth={0}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={{ xs: 0.5, sm: 1 }}
              >
                <Typography
                  fontWeight="bold"
                  variant="subtitle2"
                  sx={{ fontSize: { xs: "0.9rem", sm: "1rem" } }}
                >
                  {preset.name}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.5,
                    backgroundColor: `${color}30`,
                    color: color,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {actionName}
                </Typography>
                {preset.transformedOnly && (
                  <Typography
                    variant="caption"
                    title="Aparece em combate apenas na forma transformada"
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.5,
                      backgroundColor: "rgba(124,58,237,0.25)",
                      color: "#a78bfa",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    🜂 Forma
                  </Typography>
                )}
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontFamily: "monospace",
                  fontSize: { xs: "0.7rem", sm: "0.75rem" },
                }}
              >
                {displayText}
              </Typography>
            </Stack>

            {hovering && actionButton && (
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{ display: { xs: "none", sm: "block" } }}
              >
                {actionButton}
              </Box>
            )}
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{ display: { xs: "block", sm: "none" } }}
            >
              {actionButton}
            </Box>
          </Stack>

          {/* Expandir Detalhes */}
          {(preset.description ||
            preset.impactFormula ||
            preset.targetType) && (
            <>
              <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Divider
                  sx={{ my: 1, borderColor: "rgba(255, 255, 255, 0.1)" }}
                />

                {/* Descrição */}
                {preset.description && (
                  <Box mb={1.5}>
                    <Typography variant="caption" color="text.secondary">
                      Descrição:
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                      {preset.description}
                    </Typography>
                  </Box>
                )}

                {/* Info de Alvo */}
                <Stack
                  direction="row"
                  spacing={3}
                  mb={1.5}
                  sx={{ flexWrap: "wrap" }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Alvo:
                    </Typography>
                    <Typography variant="body2" fontWeight="500">
                      {targetName}
                    </Typography>
                  </Box>

                  {preset.requiresTurn && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Turnos:
                      </Typography>
                      <Typography variant="body2" fontWeight="500">
                        Consome turno
                      </Typography>
                    </Box>
                  )}

                  {preset.allowOutOfCombat && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Fora de combate:
                      </Typography>
                      <Typography variant="body2" fontWeight="500">
                        ✓ Permitido
                      </Typography>
                    </Box>
                  )}
                </Stack>

                {/* Crítico */}
                {preset.critThreshold && (
                  <Box mb={1.5}>
                    <Typography variant="caption" color="text.secondary">
                      Crítico:
                    </Typography>
                    <Typography variant="body2" fontWeight="500">
                      ≥{preset.critThreshold} (×{preset.critMultiplier})
                    </Typography>
                  </Box>
                )}

                {/* Calculadora de Dano */}
                {preset.impactFormula && (
                  <Box mb={1.5}>
                    <DamageCalculator
                      impactFormula={preset.impactFormula}
                      diceFormula={preset.diceFormula}
                      modifier={preset.modifier}
                      characterAttribute={characterAttribute}
                      critThreshold={preset.critThreshold ?? undefined}
                      critMultiplier={preset.critMultiplier ?? undefined}
                    />
                  </Box>
                )}

                {/* Ações */}
                {canEdit && (onEdit || onDelete) && (
                  <Stack direction="row" spacing={1} mt={2}>
                    {onEdit && (
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit();
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDeleteDialog(true);
                        }}
                      >
                        Remover
                      </Button>
                    )}
                  </Stack>
                )}
              </Collapse>

              {/* Toggle Expandir */}
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                sx={{
                  mt: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  opacity: 0.6,
                  transition: "opacity 0.2s",
                  "&:hover": { opacity: 1 },
                }}
              >
                <ExpandMoreIcon
                  sx={{
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s",
                    fontSize: "1.2rem",
                  }}
                />
              </Box>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
      >
        <DialogTitle>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja deletar <strong>{preset.name}</strong>? Esta
            ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={onDelete}>
            Deletar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
