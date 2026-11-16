"use client";

import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Theme,
  Typography,
  useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { CharacterSheet } from "../Character/CharacterSheet";
import { characterImageSrc } from "../../lib/characterImage";
import { Character } from "../../types/types";

type SheetEntry = {
  /** Personagem como vem do combate (forma ativa, com ownerId). */
  character: Character;
  isActiveTurn?: boolean;
  isDead?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fichas disponíveis. Jogador: só a dele. Mestre: todos os participantes. */
  entries: SheetEntry[];
  /** Ficha aberta ao abrir o modal (default: a primeira). */
  initialCharacterId?: string | null;
  isMaster: boolean;
};

/**
 * Ficha completa dentro do combate, sem sair da tela. O mestre alterna entre
 * os participantes pelos chips do topo; o jogador vê só a própria ficha.
 * Tela cheia no celular.
 */
export function CombatSheetDialog({ open, onClose, entries, initialCharacterId, isMaster }: Props) {
  const fullScreen = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Ao (re)abrir, começa pela ficha pedida
  useEffect(() => {
    if (open) setSelectedId(initialCharacterId ?? entries[0]?.character.id ?? null);
    // entries muda a cada refresh do combate — só reage à abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCharacterId]);

  const selected = entries.find((e) => e.character.id === selectedId) ?? entries[0];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { bgcolor: "#0e0e1a", backgroundImage: "none", height: fullScreen ? "100%" : "90vh" } }}
    >
      <DialogTitle
        sx={{
          display: "flex", flexDirection: "column", gap: 1, pb: 1,
          pt: fullScreen ? "calc(12px + env(safe-area-inset-top))" : undefined,
          borderBottom: "1px solid rgba(107,122,219,0.2)",
        }}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography component="span" fontWeight={700} sx={{ flex: 1, color: "#8B9DFF" }} noWrap>
            {isMaster ? "Fichas do combate" : "Minha ficha"}
          </Typography>
          <IconButton aria-label="Fechar ficha" onClick={onClose} sx={{ color: "#aaa" }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Seletor de participantes (só faz sentido com mais de uma ficha) */}
        {entries.length > 1 && (
          <Stack
            direction="row"
            gap={0.75}
            sx={{ overflowX: "auto", pb: 0.5, mx: -0.5, px: 0.5, scrollbarWidth: "thin" }}
          >
            {entries.map(({ character, isActiveTurn, isDead }) => {
              const isSelected = character.id === selected?.character.id;
              return (
                <Chip
                  key={character.id}
                  avatar={<Avatar src={characterImageSrc(character.image)}>{character.name[0]}</Avatar>}
                  label={`${isActiveTurn ? "⚔️ " : ""}${character.name}`}
                  onClick={() => setSelectedId(character.id)}
                  sx={{
                    flexShrink: 0,
                    opacity: isDead ? 0.5 : 1,
                    bgcolor: isSelected ? "rgba(139,157,255,0.22)" : "rgba(255,255,255,0.05)",
                    color: isSelected ? "#cdd1ff" : "#aaa",
                    border: isSelected ? "1px solid rgba(139,157,255,0.6)" : "1px solid transparent",
                  }}
                />
              );
            })}
          </Stack>
        )}
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 1, sm: 2 }, pb: "calc(16px + env(safe-area-inset-bottom))" }}>
        {selected ? (
          <Box sx={{ pt: 1 }}>
            {/* key = troca de personagem remonta a ficha (ela busca os próprios dados) */}
            <CharacterSheet
              key={selected.character.id}
              characterLoaded={selected.character}
              isMasterView={isMaster}
              embedded
            />
          </Box>
        ) : (
          <Typography color="#888" p={2}>Nenhuma ficha disponível.</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
