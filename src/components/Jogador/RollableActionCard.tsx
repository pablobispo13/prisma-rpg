"use client";

import { useState } from "react";
import { Card, CardContent, Box, Typography, Skeleton } from "@mui/material";
import CasinoIcon from "@mui/icons-material/Casino";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../lib/api";

type Props = {
  characterId: string;
  actionPresetId?: string;
  icon: React.ReactNode;
  color: string;
  label: string;
  value?: number;
  loading?: boolean;
  // "square" = card de atributo (ícone em cima, valor grande centralizado)
  // "row" = card de ação rápida em lista (ícone à esquerda, label + resultado à direita)
  layout?: "square" | "row";
};

/**
 * Card clicável que rola um teste (via actionPresetId) e mostra o resultado
 * sobrepondo o valor por alguns segundos. Usado nos Atributos da ficha e nas
 * Ações Fora de Combate.
 */
export function RollableActionCard({
  characterId,
  actionPresetId,
  icon,
  color,
  label,
  value,
  loading = false,
  layout = "square",
}: Props) {
  const [hovering, setHovering] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const clickable = !!actionPresetId && !loading;
  const isRow = layout === "row";

  async function handleRoll() {
    if (!clickable || rolling) return;
    setRolling(true);
    try {
      const res = await api.post("/roll", { actionPresetId, characterId });
      setResult(res.data.roll.total);
      setTimeout(() => setResult(null), 6000);
    } finally {
      setRolling(false);
    }
  }

  return (
    <Card
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleRoll}
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: `2px solid ${hovering && clickable ? color : "rgba(255, 255, 255, 0.1)"}`,
        borderRadius: 2,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: hovering && clickable
          ? `0 8px 24px ${color}40`
          : "0 2px 8px rgba(0, 0, 0, 0.3)",
        height: isRow ? "auto" : "100%",
        width: isRow ? "100%" : undefined,
        cursor: clickable ? "pointer" : "default",
        opacity: clickable || loading ? 1 : 0.55,
      }}
    >
      <CardContent
        sx={{
          p: 1.5,
          "&:last-child": { pb: 1.5 },
          textAlign: isRow ? "left" : "center",
          display: "flex",
          flexDirection: isRow ? "row" : "column",
          alignItems: "center",
          gap: isRow ? 1.5 : 0,
        }}
      >
        <Box
          sx={{
            fontSize: "1.5rem",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${color}20`,
            borderRadius: 1,
            border: `1px solid ${color}40`,
            margin: isRow ? 0 : "0 auto 0.75rem",
            color,
            flexShrink: 0,
          }}
        >
          <AnimatePresence mode="wait">
            {rolling ? (
              <motion.div
                key="rolling"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              >
                <CasinoIcon fontSize="inherit" />
              </motion.div>
            ) : (
              <motion.div key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {icon}
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        <Box sx={{ flex: isRow ? 1 : undefined, minWidth: 0, width: isRow ? "100%" : undefined }}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mb={isRow ? 0 : 0.5}
            noWrap
          >
            {label}
          </Typography>
          {loading ? (
            <Skeleton width={isRow ? 60 : "50%"} sx={{ mx: isRow ? 0 : "auto" }} />
          ) : (
            <AnimatePresence mode="wait">
              {result !== null ? (
                <motion.div
                  key="result"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Typography
                    variant={isRow ? "subtitle1" : "h5"}
                    fontWeight="bold"
                    sx={{ color: "#fbbf24" }}
                  >
                    → {result}
                  </Typography>
                </motion.div>
              ) : value !== undefined ? (
                <motion.div key="value" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Typography variant="h5" fontWeight="bold" sx={{ color }}>
                    {value}
                  </Typography>
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
