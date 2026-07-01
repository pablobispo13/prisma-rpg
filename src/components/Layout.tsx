import Head from "next/head";
import { ReactNode } from "react";
import { AppBar, Toolbar, Button, Box, Typography, Chip } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useCampaign } from "../context/CampaignContext";
import LogoutIcon from "@mui/icons-material/Logout";
import CampaignSelector from "./Campaign/CampaignSelector";
import DiceLogo from "./DiceLogo";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { activeCampaign } = useCampaign();
  const title = activeCampaign ? `${activeCampaign.name} — Prisma RPG` : "Prisma RPG";

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0e0e1a" }}>
      {user && (
        <AppBar
          position="static"
          elevation={0}
          sx={{
            background: "linear-gradient(90deg, rgba(14,14,26,0.98) 0%, rgba(22,22,40,0.97) 100%)",
            borderBottom: "1px solid rgba(107,122,219,0.2)",
            boxShadow: "0 1px 12px rgba(0,0,0,0.4)",
          }}
        >
          <Toolbar
            sx={{
              display: "flex",
              justifyContent: "space-between",
              minHeight: "50px !important",
              px: { xs: 2, md: 3 },
            }}
          >
            {/* Logo */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
              <DiceLogo size={24} glow={false} showNumber={false} />
              <Typography
                sx={{
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

            {/* Right: role + name + logout */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <CampaignSelector />
              <Chip
                label={user.role === "MESTRE" ? "🎲 Mestre" : "🧙 Jogador"}
                size="small"
                sx={{
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
              <Typography
                variant="caption"
                sx={{
                  color: "#9aa0b4",
                  fontSize: 12,
                  display: { xs: "none", sm: "block" },
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
                sx={{
                  color: "#666",
                  fontSize: 12,
                  textTransform: "none",
                  minWidth: 0,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1.5,
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
      <Box component="main" sx={{ flex: 1, overflow: "hidden" }}>
        {children}
      </Box>
    </Box>
  </>
  );
}
