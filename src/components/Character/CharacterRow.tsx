import {
  Box,
  Stack,
  Typography,
  Avatar,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Divider,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { FormCreateDialog } from "./FormCreateDialog";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useState } from "react";
import { toast } from "react-toastify";
import api from "../../lib/api";
import { Character } from "../../types/types";

type Props = {
  character: Character;
  onAccess: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  onFormCreated?: () => void;
  onHide?: () => void;
  isHidden?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  isDragOver?: boolean;
};

function StatTooltipContent({ character }: { character: Character }) {
  const attrs = [
    { label: "Força", value: character.strength },
    { label: "Agilidade", value: character.agility },
    { label: "Vigor", value: character.vigor },
    { label: "Intelecto", value: character.intellect },
    { label: "Presença", value: character.presence },
  ];
  return (
    <Box sx={{ p: 0.5, minWidth: 140 }}>
      <Typography fontSize={12} fontWeight={700} mb={0.75}>
        {character.name}
      </Typography>
      {attrs.map(({ label, value }) => (
        <Stack
          key={label}
          direction="row"
          justifyContent="space-between"
          spacing={3}
        >
          <Typography fontSize={11} color="#9ca3af">
            {label}
          </Typography>
          <Typography fontSize={11} fontWeight={600}>
            {value}
          </Typography>
        </Stack>
      ))}
      <Divider sx={{ my: 0.75, borderColor: "#333" }} />
      <Stack direction="row" justifyContent="space-between" spacing={3}>
        <Typography fontSize={11} color="#9ca3af">
          Defesa
        </Typography>
        <Typography fontSize={11} fontWeight={600} color="#4fc3f7">
          {character.baseDefense}
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between" spacing={3}>
        <Typography fontSize={11} color="#9ca3af">
          XP
        </Typography>
        <Typography fontSize={11} fontWeight={600} color="#fbbf24">
          {character.xp}
        </Typography>
      </Stack>
      {(character.presets?.length ?? 0) > 0 && (
        <Stack direction="row" justifyContent="space-between" spacing={3}>
          <Typography fontSize={11} color="#9ca3af">
            Ações
          </Typography>
          <Typography fontSize={11} fontWeight={600} color="#a78bfa">
            {character.presets.length}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

export function CharacterRow({
  character,
  onAccess,
  onDelete,
  onClone,
  onFormCreated,
  onHide,
  isHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hpPct =
    character.maxLife > 0 ? (character.life / character.maxLife) * 100 : 0;
  const hpColor =
    hpPct <= 0
      ? "#555"
      : hpPct <= 25
        ? "#f87171"
        : hpPct <= 50
          ? "#fbbf24"
          : hpPct <= 75
            ? "#a3e635"
            : "#4ade80";

  async function handleClone() {
    setCloning(true);
    try {
      await api.post(`/characters/${character.id}`);
      toast.success(`Cópia de "${character.name}" criada`);
      onClone?.();
    } catch {
      toast.error("Erro ao clonar personagem");
    } finally {
      setCloning(false);
    }
  }


  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/characters/${character.id}`);
      toast.success("Personagem removido");
      setDeleteOpen(false);
      onDelete?.();
    } catch {
      toast.error("Erro ao remover personagem");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Box
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          py: 0.875,
          px: 1.5,
          borderRadius: 1,
          bgcolor: isDragOver
            ? "rgba(107,122,219,0.1)"
            : "rgba(255,255,255,0.02)",
          border: isDragOver
            ? "1px solid rgba(107,122,219,0.55)"
            : "1px solid rgba(255,255,255,0.05)",
          boxShadow: isDragOver ? "0 0 0 2px rgba(107,122,219,0.2)" : "none",
          opacity: isHidden ? 0.42 : 1,
          transition: "all 0.15s",
          "&:hover": {
            bgcolor: isDragOver
              ? "rgba(107,122,219,0.1)"
              : "rgba(107,122,219,0.07)",
            borderColor: isDragOver
              ? "rgba(107,122,219,0.55)"
              : "rgba(107,122,219,0.25)",
          },
        }}
      >
        {/* Drag handle */}
        {onDragStart && (
          <Box
            sx={{
              color: "#2a2a3a",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              cursor: "grab",
              ml: -0.5,
              "&:hover": { color: "#555" },
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 18 }} />
          </Box>
        )}

        {/* Avatar — hover shows all stats */}
        <Tooltip
          title={<StatTooltipContent character={character} />}
          placement="right"
          arrow
          componentsProps={{
            tooltip: {
              sx: {
                bgcolor: "#12121e",
                border: "1px solid rgba(107,122,219,0.3)",
                maxWidth: 220,
              },
            },
          }}
        >
          <Avatar
            src={"/characters/" + character.image || undefined}
            sx={{
              width: 34,
              height: 34,
              fontSize: 13,
              flexShrink: 0,
              cursor: "help",
              bgcolor: "#1e2035",
              border: "1px solid rgba(107,122,219,0.2)",
            }}
          >
            {character.name[0]}
          </Avatar>
        </Tooltip>

        {/* Name + HP */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography fontSize={13} fontWeight={600} noWrap lineHeight={1.2}>
              {character.name}
            </Typography>
            {character.formGroup && character.formGroup.activeId !== character.formGroup.primaryId && (
              <Chip
                label="🜂 Transformado"
                size="small"
                title="Este personagem está em uma forma alternativa"
                sx={{ height: 16, fontSize: 9, bgcolor: "rgba(124,58,237,0.18)", color: "#a78bfa", flexShrink: 0 }}
              />
            )}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1} mt={0.35}>
            <LinearProgress
              value={hpPct}
              variant="determinate"
              sx={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                bgcolor: "#1e1e2e",
                "& .MuiLinearProgress-bar": {
                  bgcolor: hpColor,
                  transition: "width 0.4s ease",
                },
              }}
            />
            <Typography
              fontSize={9}
              color="#555"
              sx={{ flexShrink: 0, fontFamily: "monospace" }}
            >
              {character.life}/{character.maxLife}
            </Typography>
          </Stack>
        </Box>

        {/* Badges */}
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          <Chip
            label={`DEF ${character.baseDefense}`}
            size="small"
            sx={{
              fontSize: 10,
              height: 20,
              bgcolor: "rgba(79,195,247,0.08)",
              color: "#4fc3f7",
              border: "1px solid rgba(79,195,247,0.18)",
            }}
          />
          {(character.presets?.length ?? 0) > 0 && (
            <Chip
              label={`${character.presets.length}×`}
              size="small"
              title={`${character.presets.length} ações configuradas`}
              sx={{
                fontSize: 10,
                height: 20,
                bgcolor: "rgba(167,139,250,0.08)",
                color: "#a78bfa",
                border: "1px solid rgba(167,139,250,0.18)",
              }}
            />
          )}
        </Stack>

        {/* Action buttons */}
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
          {onHide && (
            <Tooltip title={isHidden ? "Mostrar" : "Ocultar"}>
              <IconButton
                size="small"
                onClick={onHide}
                sx={{
                  color: isHidden ? "#6B7ADB" : "#2d2d3d",
                  "&:hover": { color: isHidden ? "#8B9DFF" : "#6B7ADB" },
                }}
              >
                {isHidden ? (
                  <VisibilityIcon sx={{ fontSize: 15 }} />
                ) : (
                  <VisibilityOffIcon sx={{ fontSize: 15 }} />
                )}
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="Abrir ficha">
            <IconButton
              size="small"
              onClick={onAccess}
              sx={{ color: "#6B7ADB", "&:hover": { color: "#8B9DFF" } }}
            >
              <OpenInNewIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          {onClone && (
            <Tooltip title="Clonar personagem">
              <span>
                <IconButton
                  size="small"
                  onClick={handleClone}
                  disabled={cloning}
                  sx={{ color: "#555", "&:hover": { color: "#aaa" } }}
                >
                  {cloning ? (
                    <CircularProgress size={12} />
                  ) : (
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {onFormCreated && (
            <Tooltip title="Criar forma alternativa (transformação)">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setFormDialogOpen(true)}
                  disabled={cloning}
                  sx={{ color: "#7c3aed", "&:hover": { color: "#a78bfa" } }}
                >
                  <AutorenewIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}

          {onDelete && (
            <Tooltip title="Excluir">
              <IconButton
                size="small"
                onClick={() => setDeleteOpen(true)}
                sx={{ color: "#555", "&:hover": { color: "#f87171" } }}
              >
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {/* Delete dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>Excluir {character.name}?</DialogTitle>
        <DialogContent>
          <Typography fontSize={13} color="#aaa">
            Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteOpen(false)}
            color="inherit"
            disabled={deleting}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
            Excluir
          </Button>
        </DialogActions>
      </Dialog>

      {/* Nova forma */}
      <FormCreateDialog
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        primaryId={character.formGroup?.primaryId ?? character.id}
        characterName={character.name}
        onCreated={onFormCreated}
      />
    </>
  );
}
