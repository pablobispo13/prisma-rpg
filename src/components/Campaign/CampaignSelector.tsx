import { useState } from "react";
import { useRouter } from "next/router";
import { Box, Button, Menu, MenuItem, Divider, ListItemText, Chip } from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { useCampaign } from "../../context/CampaignContext";
import { useAuth } from "../../context/AuthContext";

export default function CampaignSelector() {
  const router = useRouter();
  const { campaigns, activeCampaign, setActiveCampaign, loading } = useCampaign();
  const { user } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (loading) return null;

  // Caso comum: usuário tem só 1 mesa ativa → mostra como chip estático
  // (e leva pra tela de gerenciamento se clicar)
  const activeCampaigns = campaigns.filter((c) => !c.archivedAt);
  if (activeCampaigns.length <= 1 && activeCampaign) {
    return (
      <Box
        onClick={() => router.push("/protected/mesas")}
        sx={{
          display: "flex", alignItems: "center", gap: 0.5,
          background: "rgba(107,122,219,0.10)",
          border: "1px solid rgba(107,122,219,0.30)",
          borderRadius: 1.5, px: 1, py: 0.4, cursor: "pointer",
          color: "#cdd1e0", fontSize: 12, maxWidth: { xs: 130, sm: 180 }, minWidth: 0,
          "&:hover": { background: "rgba(107,122,219,0.18)" },
        }}
      >
        <GroupsIcon sx={{ fontSize: 14 }} />
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeCampaign.name}
        </Box>
      </Box>
    );
  }

  const label = activeCampaign?.name ?? "Selecionar mesa";

  return (
    <>
      <Button
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<GroupsIcon sx={{ fontSize: "16px !important" }} />}
        endIcon={<ArrowDropDownIcon sx={{ fontSize: "16px !important" }} />}
        sx={{
          color: "#cdd1e0",
          fontSize: 12,
          textTransform: "none",
          background: "rgba(107,122,219,0.10)",
          border: "1px solid rgba(107,122,219,0.30)",
          borderRadius: 1.5,
          px: 1,
          py: 0.3,
          maxWidth: { xs: 140, sm: 180 },
          minWidth: 0,
          "& .MuiButton-startIcon, & .MuiButton-endIcon": { mx: 0.3 },
          "&:hover": { background: "rgba(107,122,219,0.18)" },
        }}
      >
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </Box>
      </Button>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        PaperProps={{
          sx: {
            background: "#16162a",
            border: "1px solid rgba(107,122,219,0.25)",
            mt: 0.5,
            minWidth: { xs: "min(240px, calc(100vw - 32px))", sm: 240 },
          },
        }}
      >
        {campaigns.length === 0 && (
          <MenuItem disabled sx={{ color: "#888", fontSize: 12 }}>
            Você ainda não participa de nenhuma mesa
          </MenuItem>
        )}
        {campaigns.map((c) => (
          <MenuItem
            key={c.id}
            selected={activeCampaign?.id === c.id}
            onClick={() => {
              setActiveCampaign(c);
              setAnchor(null);
            }}
            sx={{ color: "#cdd1e0", fontSize: 13 }}
          >
            <ListItemText
              primary={c.name}
              secondary={`Mestre: ${c.master.username} · ${c.members.length} membro(s)`}
              secondaryTypographyProps={{ sx: { fontSize: 11, color: "#7a7f95" } }}
            />
            {c.masterId === user?.id && (
              <Chip label="Mestre" size="small" sx={{ ml: 1, fontSize: 10, height: 18, background: "rgba(107,122,219,0.2)", color: "#8B9DFF" }} />
            )}
          </MenuItem>
        ))}
        <Divider sx={{ borderColor: "rgba(107,122,219,0.20)", my: 0.5 }} />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            router.push("/protected/mesas");
          }}
          sx={{ color: "#8B9DFF", fontSize: 12 }}
        >
          Gerenciar mesas…
        </MenuItem>
      </Menu>
    </>
  );
}
