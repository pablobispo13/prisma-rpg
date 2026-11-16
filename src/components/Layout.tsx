import Head from "next/head";
import Link from "next/link";
import { ReactNode } from "react";
import { AppBar, Toolbar, Button, Box, Typography, Chip, IconButton, Tooltip } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useCampaign } from "../context/CampaignContext";
import LogoutIcon from "@mui/icons-material/Logout";
import InstallMobileIcon from "@mui/icons-material/InstallMobile";
import CampaignSelector from "./Campaign/CampaignSelector";
import DiceLogo from "./DiceLogo";
import ReleaseNotesButton from "./ReleaseNotes/ReleaseNotesButton";
import { usePwaInstall } from "../lib/pwa";

type LayoutProps = {
  children: ReactNode;
};

// Altura da AppBar (sem a área do notch). Telas de altura fixa (combate,
// mesa do mestre) descontam via var(--app-bar-h) — ver FULL_HEIGHT em lib/layout.ts
const APP_BAR_HEIGHT = 50;

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { activeCampaign } = useCampaign();
  const { canInstall, install } = usePwaInstall();
  const title = activeCampaign ? `${activeCampaign.name} — Prisma RPG` : "Prisma RPG";

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <Box
        sx={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "#0e0e1a",
          // Lido por CombatScreen/MesaMestre pra ocupar exatamente o resto da tela
          "--app-bar-h": user ? `calc(${APP_BAR_HEIGHT}px + env(safe-area-inset-top))` : "0px",
          // PWA instalado em paisagem: conteúdo não fica embaixo do notch lateral
          pl: "env(safe-area-inset-left)",
          pr: "env(safe-area-inset-right)",
        }}
      >
      {user && (
        <AppBar
          position="static"
          elevation={0}
          sx={{
            background: "linear-gradient(90deg, rgba(14,14,26,0.98) 0%, rgba(22,22,40,0.97) 100%)",
            borderBottom: "1px solid rgba(107,122,219,0.2)",
            boxShadow: "0 1px 12px rgba(0,0,0,0.4)",
            pt: "env(safe-area-inset-top)",
          }}
        >
          <Toolbar
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: 1,
              minHeight: `${APP_BAR_HEIGHT}px !important`,
              height: APP_BAR_HEIGHT,
              px: { xs: 1.5, md: 3 },
            }}
          >
            {/* Logo — no celular só o dado; o nome da mesa já aparece no seletor.
                Clicável: no PWA instalado não existe botão "voltar" do
                navegador (no iOS nem gesto), então é o caminho de volta à mesa */}
            <Box
              component={Link}
              href="/protected/"
              aria-label="Ir para a mesa"
              sx={{ display: "flex", alignItems: "center", gap: 1.2, minWidth: 0, textDecoration: "none" }}
            >
              <DiceLogo size={24} glow={false} showNumber={false} />
              <Typography
                noWrap
                sx={{
                  display: { xs: "none", md: "block" },
                  fontWeight: 800,
                  color: "#8B9DFF",
                  letterSpacing: 2.5,
                  fontSize: 13,
                  fontFamily: "'Rubik', sans-serif",
                  textTransform: "uppercase",
                }}
              >
                {activeCampaign?.name ?? "Prisma RPG"}
              </Typography>
            </Box>

            {/* Right: mesa + papel + novidades + instalar + nome + sair */}
            <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.75, sm: 1.5 }, minWidth: 0 }}>
              <CampaignSelector />
              <Chip
                label={user.role === "MESTRE" ? "🎲 Mestre" : "🧙 Jogador"}
                size="small"
                sx={{
                  display: { xs: "none", sm: "inline-flex" },
                  background:
                    user.role === "MESTRE"
                      ? "rgba(107,122,219,0.18)"
                      : "rgba(102,187,106,0.15)",
                  color: user.role === "MESTRE" ? "#8B9DFF" : "#66bb6a",
                  border: `1px solid ${
                    user.role === "MESTRE"
                      ? "rgba(107,122,219,0.35)"
                      : "rgba(102,187,106,0.35)"
                  }`,
                  fontSize: 11,
                  height: 22,
                  fontWeight: 600,
                  "& .MuiChip-label": { px: 1 },
                }}
              />
              <ReleaseNotesButton />
              {canInstall && (
                <Tooltip title="Instalar app">
                  <IconButton size="small" onClick={install} sx={{ color: "#8B9DFF" }}>
                    <InstallMobileIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Typography
                variant="caption"
                sx={{
                  color: "#9aa0b4",
                  fontSize: 12,
                  display: { xs: "none", md: "block" },
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.username}
              </Typography>
              <Button
                size="small"
                startIcon={<LogoutIcon sx={{ fontSize: "14px !important" }} />}
                onClick={() => logout("manual")}
                aria-label="Sair"
                sx={{
                  color: "#666",
                  fontSize: 12,
                  textTransform: "none",
                  minWidth: 0,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1.5,
                  "& .MuiButton-startIcon": { mr: { xs: 0, sm: 1 } },
                  "&:hover": {
                    color: "#f87171",
                    background: "rgba(248,113,113,0.08)",
                  },
                  transition: "color 0.2s, background 0.2s",
                }}
              >
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  Sair
                </Box>
              </Button>
            </Box>
          </Toolbar>
        </AppBar>
      )}
      {/* overflow-x: clip (e não hidden) — corta vazamento lateral sem virar
          container de scroll, então não quebra position:sticky dos filhos */}
      <Box component="main" sx={{ flex: 1, minWidth: 0, overflowX: "clip", pb: "env(safe-area-inset-bottom)" }}>
        {children}
      </Box>
    </Box>
  </>
  );
}
