import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Theme,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import NewReleasesIcon from "@mui/icons-material/NewReleases";
import {
  LATEST_RELEASE,
  RELEASE_NOTES,
  ReleaseAudience,
  ReleaseItemType,
} from "../../data/releaseNotes";

// Última versão que este navegador já abriu no painel (por aparelho — não
// é preferência salva no banco)
const SEEN_KEY = "releaseNotes.lastSeenVersion";

const TYPE_META: Record<ReleaseItemType, { label: string; color: string }> = {
  new: { label: "Novidades", color: "#4ade80" },
  improved: { label: "Melhorias", color: "#60a5fa" },
  fixed: { label: "Correções", color: "#fbbf24" },
  removed: { label: "Removido", color: "#f87171" },
};
const TYPE_ORDER: ReleaseItemType[] = ["new", "improved", "fixed", "removed"];

const AUDIENCE_LABEL: Record<ReleaseAudience, string> = {
  master: "Mestre",
  player: "Jogador",
};

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function ReleaseNotesButton() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const fullScreen = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));

  useEffect(() => {
    if (!LATEST_RELEASE) return;
    try {
      setUnseen(localStorage.getItem(SEEN_KEY) !== LATEST_RELEASE.version);
    } catch {
      // Storage bloqueado (aba anônima etc.): só não mostra o indicador
    }
  }, []);

  function handleOpen() {
    setOpen(true);
    setUnseen(false);
    try {
      localStorage.setItem(SEEN_KEY, LATEST_RELEASE.version);
    } catch {
      // idem
    }
  }

  if (!LATEST_RELEASE) return null;

  return (
    <>
      <Tooltip title={unseen ? `Novidades da versão ${LATEST_RELEASE.version}` : "Novidades"}>
        <IconButton size="small" aria-label="Novidades" onClick={handleOpen} sx={{ color: unseen ? "#8B9DFF" : "#666" }}>
          <Badge variant="dot" color="secondary" invisible={!unseen}>
            <NewReleasesIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={fullScreen}
        PaperProps={{ sx: { bgcolor: "#12121e", backgroundImage: "none" } }}
      >
        <DialogTitle sx={{ color: "#8B9DFF" }}>Novidades</DialogTitle>
        <DialogContent dividers sx={{ borderColor: "rgba(107,122,219,0.2)" }}>
          <Stack spacing={3} divider={<Divider sx={{ borderColor: "rgba(107,122,219,0.15)" }} />}>
            {RELEASE_NOTES.map((release) => (
              <Box key={release.version}>
                <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap" useFlexGap>
                  <Typography fontWeight={700} fontSize={16} color="#cdd1e0">
                    {release.title}
                  </Typography>
                  <Typography fontSize={12} color="#7a7f95">
                    v{release.version} · {formatDate(release.date)}
                  </Typography>
                </Stack>
                {release.summary && (
                  <Typography fontSize={13} color="#9aa0b4" mt={0.75}>
                    {release.summary}
                  </Typography>
                )}

                {TYPE_ORDER.map((type) => {
                  const items = release.items.filter((i) => i.type === type);
                  if (items.length === 0) return null;
                  const meta = TYPE_META[type];
                  return (
                    <Box key={type} mt={2}>
                      <Typography fontSize={12} fontWeight={700} color={meta.color} sx={{ textTransform: "uppercase", letterSpacing: 1, mb: 0.75 }}>
                        {meta.label}
                      </Typography>
                      <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
                        {items.map((item, i) => (
                          <Typography component="li" key={i} fontSize={13} color="#cdd1e0" lineHeight={1.5}>
                            {item.text}
                            {item.audience && (
                              <Chip
                                label={AUDIENCE_LABEL[item.audience]}
                                size="small"
                                sx={{
                                  ml: 0.75, height: 18, fontSize: 10, verticalAlign: "text-bottom",
                                  bgcolor: item.audience === "master" ? "rgba(107,122,219,0.18)" : "rgba(102,187,106,0.15)",
                                  color: item.audience === "master" ? "#8B9DFF" : "#66bb6a",
                                }}
                              />
                            )}
                          </Typography>
                        ))}
                      </Stack>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} variant="contained">
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
