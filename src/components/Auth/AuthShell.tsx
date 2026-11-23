import { Box, Paper, Typography } from "@mui/material";
import { ReactNode } from "react";
import DiceLogo from "../DiceLogo";

export const fieldSx = {
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "rgba(107,122,219,0.25)" },
    "&:hover fieldset": { borderColor: "rgba(107,122,219,0.5)" },
    "&.Mui-focused fieldset": { borderColor: "#6B7ADB" },
    background: "rgba(255,255,255,0.03)",
    borderRadius: 1.5,
  },
  "& .MuiInputLabel-root": { color: "#666" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#8B9DFF" },
  "& .MuiInputBase-input": { fontSize: 14 },
};

export const submitButtonSx = {
  mt: 3,
  py: 1.4,
  background: "linear-gradient(135deg, #5a6bcf 0%, #7b8ee8 100%)",
  "&:hover": {
    background: "linear-gradient(135deg, #4a5bbf 0%, #6a7dd8 100%)",
    boxShadow: "0 4px 20px rgba(107,122,219,0.4)",
  },
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "none",
  fontSize: 14,
  borderRadius: 2,
  transition: "all 0.2s",
} as const;

export const iconSx = { fontSize: 16, color: "rgba(107,122,219,0.6)" };

/** Fundo + cartão + cabeçalho com logo, compartilhado pelas telas de autenticação. */
export default function AuthShell({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 50% -10%, rgba(107,122,219,0.18) 0%, #0e0e1a 55%)",
        p: 2,
      }}
    >
      {/* Decorative glow orbs */}
      <Box
        sx={{
          position: "fixed",
          top: "10%",
          left: "15%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(107,122,219,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "fixed",
          bottom: "15%",
          right: "10%",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,157,255,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <Paper
        elevation={24}
        sx={{
          width: "100%",
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          background:
            "linear-gradient(145deg, rgba(28,28,50,0.9) 0%, rgba(14,14,26,0.97) 100%)",
          border: "1px solid rgba(107,122,219,0.25)",
          borderRadius: 3,
          backdropFilter: "blur(16px)",
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, rgba(107,122,219,0.6), transparent)",
          },
        }}
      >
        <Box sx={{ textAlign: "center", mb: 3.5 }}>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
            <DiceLogo size={48} />
          </Box>
          <Typography
            variant="h5"
            sx={{
              color: "#8B9DFF",
              fontWeight: 800,
              letterSpacing: 3,
              fontSize: 20,
              textTransform: "uppercase",
              fontFamily: "'Rubik', sans-serif",
            }}
          >
            Prisma RPG
          </Typography>
          <Typography variant="caption" sx={{ color: "#555", fontSize: 11, letterSpacing: 0.5 }}>
            {subtitle ?? "Sistema de combate e gestão"}
          </Typography>
        </Box>

        {children}
      </Paper>
    </Box>
  );
}
