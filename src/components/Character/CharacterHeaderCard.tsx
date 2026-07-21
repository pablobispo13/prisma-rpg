"use client";

import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Button,
  Skeleton,
  Chip,
  Divider,
  Avatar,
} from "@mui/material";
import { Character } from "../../types/types";
import EditIcon from "@mui/icons-material/Edit";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import StickyNote2Icon from "@mui/icons-material/StickyNote2";
import ShieldIcon from "@mui/icons-material/Shield";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { deepOrange } from "@mui/material/colors";
import { darken } from "@mui/material/styles";
import { useState } from "react";
import { toast } from "react-toastify";
import api from "../../lib/api";
import { characterImageSrc } from "../../lib/characterImage";
import { useCampaign } from "../../context/CampaignContext";

type Props = {
  character: Character;
  loading?: boolean;
  onEditAction?: () => void;
  onHistoryAction?: () => void;
  onNotesAction?: () => void;
  canSwitchForm?: boolean;
  onFormSwitched?: () => void;
};

export function CharacterHeaderCard({
  character,
  loading = false,
  onEditAction,
  onHistoryAction,
  onNotesAction,
  canSwitchForm = false,
  onFormSwitched,
}: Props) {
  const [switchingForm, setSwitchingForm] = useState(false);
  const formGroup = character.formGroup;
  const { activeCampaign } = useCampaign();
  // Cor de destaque da imagem: configurável por mesa; padrão laranja do sistema
  const accentColor = activeCampaign?.characterImageColor || deepOrange["A400"];

  const handleSwitchForm = async (formId: string) => {
    if (!formGroup || switchingForm || formId === formGroup.activeId) return;
    setSwitchingForm(true);
    try {
      await api.post(`/characters/${formGroup.primaryId}/switch-form`, { formId });
      const target = formGroup.options.find((o) => o.id === formId);
      toast.success(`Transformado em ${target?.name ?? "outra forma"}`);
      onFormSwitched?.();
    } catch {
      // erro já exibido pelo interceptor da api
    } finally {
      setSwitchingForm(false);
    }
  };
  return (
    <Card
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: "2px solid rgba(255, 255, 255, 0.1)",
        borderRadius: { xs: 1.5, sm: 2 },
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <CardContent
        sx={{
          p: { xs: 1.5, sm: 2.5 },
          "&:last-child": { pb: { xs: 1.5, sm: 2.5 } },
        }}
      >
        <Stack spacing={{ xs: 1.5, sm: 2 }}>
          {/* Header Principal */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "flex-start" }}
            justifyContent="space-between"
            gap={1}
          >
            <Stack
              direction="row"
              spacing={{ xs: 1, sm: 1.5 }}
              flex={1}
              minWidth={0}
            >
              {/* Avatar/Icon */}
              <Box
                sx={{
                  fontSize: { xs: "1.5rem", sm: "2rem" },
                  width: { xs: 60, sm: 120 },
                  height: { xs: 60, sm: 120 },
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: accentColor,
                  borderRadius: 1,
                  border: "1px solid " + darken(accentColor, 0.3),
                  flexShrink: 0,
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: accentColor,
                    width: "96%",
                    height: "96%",
                  }}
                  variant="square"
                  src={characterImageSrc(character.image)}
                />
              </Box>

              {/* Informações */}
              <Stack flex={1} minWidth={0}>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  noWrap
                  sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}
                >
                  {loading ? <Skeleton width="200px" /> : character.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: { xs: "0.7rem", sm: "0.75rem" },
                  }}
                >
                  {loading ? (
                    <Skeleton width="150px" />
                  ) : character.owner ? (
                    `${character.owner.username} (${character.owner.role})`
                  ) : (
                    "Sem proprietário"
                  )}
                </Typography>
              </Stack>
            </Stack>

            {/* Ações do cabeçalho */}
            {!loading && (
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                {onHistoryAction && (
                  <Button
                    size="small"
                    startIcon={<MenuBookIcon />}
                    onClick={onHistoryAction}
                    sx={{
                      whiteSpace: "nowrap",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    História
                  </Button>
                )}
                {onNotesAction && (
                  <Button
                    size="small"
                    startIcon={<StickyNote2Icon />}
                    onClick={onNotesAction}
                    sx={{
                      whiteSpace: "nowrap",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Anotações
                  </Button>
                )}
                {onEditAction && (
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={onEditAction}
                    sx={{
                      whiteSpace: "nowrap",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Editar
                  </Button>
                )}
              </Stack>
            )}
          </Stack>

          {/* Formas alternativas */}
          {formGroup && formGroup.options.length > 1 && !loading && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <AutorenewIcon sx={{ fontSize: 16, color: "#a78bfa" }} />
              <Typography variant="caption" color="text.secondary">
                Forma:
              </Typography>
              {formGroup.options.map((opt) => {
                const isActive = opt.id === formGroup.activeId;
                return (
                  <Chip
                    key={opt.id}
                    label={opt.name}
                    size="small"
                    avatar={
                      opt.image ? (
                        <Avatar src={characterImageSrc(opt.image)} />
                      ) : undefined
                    }
                    onClick={
                      canSwitchForm && !isActive && !switchingForm
                        ? () => handleSwitchForm(opt.id)
                        : undefined
                    }
                    disabled={switchingForm}
                    sx={{
                      fontSize: 11,
                      backgroundColor: isActive ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "#c4b5fd" : "#9aa0b5",
                      border: isActive ? "1px solid rgba(167,139,250,0.6)" : "1px solid transparent",
                      cursor: canSwitchForm && !isActive ? "pointer" : "default",
                    }}
                  />
                );
              })}
            </Stack>
          )}

          <Divider sx={{ borderColor: "rgba(255, 255, 255, 0.1)" }} />

          {/* Stats Secundários */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 1 }}
            flexWrap="wrap"
            useFlexGap
          >
            {/* Defesa */}
            <Chip
              icon={<ShieldIcon />}
              label={
                loading ? (
                  <Skeleton width="50px" />
                ) : (
                  `DEF: ${character.baseDefense}`
                )
              }
              sx={{
                backgroundColor: "rgba(102, 187, 106, 0.2)",
                color: "#66BB6A",
              }}
            />
          </Stack>

          {/* Descrição (se houver) — clique abre a modal completa */}
          {character.history && !loading && (
            <Box
              onClick={onHistoryAction}
              sx={{ cursor: onHistoryAction ? "pointer" : "default" }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                mb={0.5}
              >
                Histórico:
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {character.history}
              </Typography>
            </Box>
          )}
          {character.notes && !loading && (
            <Box
              onClick={onNotesAction}
              sx={{ cursor: onNotesAction ? "pointer" : "default" }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                mb={0.5}
              >
                Anotações:
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {character.notes}
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
