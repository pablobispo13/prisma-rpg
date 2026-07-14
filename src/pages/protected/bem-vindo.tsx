"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import GroupsIcon from "@mui/icons-material/Groups";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import SportsKabaddiIcon from "@mui/icons-material/SportsKabaddi";
import CasinoIcon from "@mui/icons-material/Casino";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import AddIcon from "@mui/icons-material/Add";
import { useRouter } from "next/router";
import Head from "next/head";
import DiceLogo from "../../components/DiceLogo";
import { useAuth } from "../../context/AuthContext";
import { useCampaign } from "../../context/CampaignContext";

const FEATURES = [
  {
    icon: <GroupsIcon sx={{ fontSize: 26 }} />,
    title: "Mesas de campanha",
    text: "Cada mesa tem seu mestre, seus jogadores e suas regras. Entre com um código de convite e tudo fica organizado por campanha.",
  },
  {
    icon: <AssignmentIndIcon sx={{ fontSize: 26 }} />,
    title: "Ficha de personagem",
    text: "Atributos, vida, defesa, inventário e história. Vida máxima e defesa podem ser calculadas por fórmulas configuradas pelo mestre.",
  },
  {
    icon: <FlashOnIcon sx={{ fontSize: 26 }} />,
    title: "Ações personalizadas",
    text: "Crie presets de ataque, magia, cura e buffs com dados, modificadores, críticos e efeitos ao longo dos turnos.",
  },
  {
    icon: <SportsKabaddiIcon sx={{ fontSize: 26 }} />,
    title: "Combate por turnos",
    text: "Iniciativa automática, rodadas, reações (esquiva, bloqueio e contra-ataque) e limites de ações configuráveis pela mesa.",
  },
  {
    icon: <CasinoIcon sx={{ fontSize: 26 }} />,
    title: "Rolagens integradas",
    text: "Toda rolagem fica registrada no histórico da mesa, com detalhes de dados, modificadores e resultado contra a defesa do alvo.",
  },
  {
    icon: <LiveTvIcon sx={{ fontSize: 26 }} />,
    title: "Acompanhamento ao vivo",
    text: "Tela de combate atualizada em tempo real para todos os jogadores, com log de eventos e stream da mesa.",
  },
];

const MOCK_LOGS = [
  { type: "COMBAT", text: "⚔️ Combate iniciado — iniciativa rolada!" },
  { type: "ROLL", text: "Kael rolou 1d20+4 e acertou o Zumbi (17 vs DEF 9)" },
  { type: "DAMAGE", text: "Zumbi recebeu 8 de dano" },
  { type: "REACTION", text: "Lira conseguiu esquivar (15 vs 12) e evitou o dano" },
  { type: "HEAL", text: "Bram foi curado em 6 por Toque Restaurador" },
];

export default function BemVindoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { campaigns, loading } = useCampaign();

  // Mock interativo de rolagem
  const [rolling, setRolling] = useState(false);
  const [rollValue, setRollValue] = useState<number | null>(null);

  // Se o usuário já tem mesa, esta tela não faz sentido — volta pro fluxo normal
  useEffect(() => {
    if (!loading && campaigns.some((c) => !c.archivedAt)) {
      router.replace("/protected/");
    }
  }, [loading, campaigns, router]);

  const mockLife = useMemo(() => ({ current: 22, max: 30 }), []);

  const rollMockDice = () => {
    if (rolling) return;
    setRolling(true);
    let ticks = 0;
    const interval = setInterval(() => {
      setRollValue(1 + Math.floor(Math.random() * 20));
      ticks++;
      if (ticks >= 10) {
        clearInterval(interval);
        setRolling(false);
      }
    }, 70);
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% -10%, rgba(107,122,219,0.18) 0%, #0e0e1a 55%)", color: "#cdd1e0", p: { xs: 2, md: 4 } }}>
      <Head><title>Bem-vindo — Prisma RPG</title></Head>

      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        {/* HERO */}
        <Stack alignItems="center" textAlign="center" spacing={1.5} mb={4} mt={2}>
          <DiceLogo size={56} />
          <Typography variant="h4" sx={{ color: "#8B9DFF", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Rubik', sans-serif", fontSize: { xs: 24, md: 32 } }}>
            Bem-vindo{user?.username ? `, ${user.username}` : ""}!
          </Typography>
          <Typography sx={{ color: "#7a7f95", maxWidth: 560 }}>
            Você ainda não participa de nenhuma mesa. Enquanto isso, veja o que o
            Prisma RPG faz por você e pelo seu grupo:
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={1}>
            <Button
              variant="contained"
              startIcon={<LoginIcon />}
              onClick={() => router.push("/protected/mesas")}
              sx={{ background: "linear-gradient(135deg, #5a6bcf 0%, #7b8ee8 100%)", fontWeight: 700, textTransform: "none", px: 3 }}
            >
              Entrar com código de convite
            </Button>
            {user?.isAdmin && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => router.push("/protected/mesas")}
                sx={{ textTransform: "none" }}
              >
                Criar uma mesa
              </Button>
            )}
          </Stack>
          <Typography variant="caption" sx={{ color: "#555" }}>
            Peça o código de 6 letras ao mestre da sua mesa.
          </Typography>
        </Stack>

        {/* MOCK: FICHA + COMBATE */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={4}>
          {/* Ficha mock */}
          <Card sx={{ flex: 1, background: "#16162a", border: "1px solid rgba(107,122,219,0.25)" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography fontWeight={700} sx={{ color: "#cdd1e0" }}>🧝 Kael, o Andarilho</Typography>
                <Chip label="Exemplo" size="small" sx={{ height: 18, fontSize: 10, background: "rgba(107,122,219,0.2)", color: "#8B9DFF" }} />
              </Stack>
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                HP {mockLife.current}/{mockLife.max}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(mockLife.current / mockLife.max) * 100}
                sx={{ height: 8, borderRadius: 1, my: 0.5, backgroundColor: "rgba(248,113,113,0.15)", "& .MuiLinearProgress-bar": { backgroundColor: "#66bb6a" } }}
              />
              <Stack direction="row" spacing={0.75} mt={1.5} flexWrap="wrap" useFlexGap>
                {[["FOR", 3], ["AGI", 4], ["VIG", 2], ["INT", 1], ["PRE", 2], ["DEF", 9]].map(([label, v]) => (
                  <Chip key={label} label={`${label} ${v}`} size="small" sx={{ fontSize: 11, background: "rgba(255,255,255,0.05)", color: "#cdd1e0" }} />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
                <Chip label="🗡️ Lâmina Veloz — 1d20+AGI" size="small" sx={{ background: "rgba(124,58,237,0.18)", color: "#a78bfa", fontSize: 11 }} />
                <Chip label="🏹 Tiro Certeiro — 1d20+AGI" size="small" sx={{ background: "rgba(124,58,237,0.18)", color: "#a78bfa", fontSize: 11 }} />
                <Chip label="💨 Esquiva" size="small" sx={{ background: "rgba(255,167,38,0.15)", color: "#ffb74d", fontSize: 11 }} />
              </Stack>
            </CardContent>
          </Card>

          {/* Log de combate mock + dado interativo */}
          <Card sx={{ flex: 1, background: "#16162a", border: "1px solid rgba(107,122,219,0.25)" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography fontWeight={700} sx={{ color: "#cdd1e0" }}>📜 Log de combate</Typography>
                <Chip label="Exemplo" size="small" sx={{ height: 18, fontSize: 10, background: "rgba(107,122,219,0.2)", color: "#8B9DFF" }} />
              </Stack>
              <Stack spacing={0.75} mb={2}>
                {MOCK_LOGS.map((log, i) => (
                  <Typography key={i} variant="caption" sx={{ color: log.type === "DAMAGE" ? "#f87171" : log.type === "HEAL" ? "#66bb6a" : log.type === "REACTION" ? "#ffb74d" : "#9aa0b5", display: "block" }}>
                    {log.text}
                  </Typography>
                ))}
              </Stack>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CasinoIcon />}
                  onClick={rollMockDice}
                  disabled={rolling}
                  sx={{ textTransform: "none" }}
                >
                  Testar um d20
                </Button>
                {rollValue !== null && (
                  <Typography variant="h5" sx={{ fontWeight: 800, color: rollValue === 20 ? "#66bb6a" : rollValue === 1 ? "#f87171" : "#8B9DFF", minWidth: 36 }}>
                    {rollValue}
                    {!rolling && rollValue === 20 && " 🎉"}
                    {!rolling && rollValue === 1 && " 💀"}
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        {/* FEATURES */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 2, mb: 5 }}>
          {FEATURES.map((f) => (
            <Card key={f.title} sx={{ background: "#16162a", border: "1px solid rgba(107,122,219,0.20)", transition: "border-color .2s, transform .2s", "&:hover": { borderColor: "rgba(107,122,219,0.5)", transform: "translateY(-2px)" } }}>
              <CardContent>
                <Box sx={{ color: "#8B9DFF", mb: 1 }}>{f.icon}</Box>
                <Typography fontWeight={700} sx={{ color: "#cdd1e0", mb: 0.5, fontSize: 15 }}>{f.title}</Typography>
                <Typography variant="body2" sx={{ color: "#7a7f95", fontSize: 13 }}>{f.text}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* CTA FINAL */}
        <Stack alignItems="center" spacing={1} pb={4}>
          <Typography sx={{ color: "#7a7f95", fontSize: 14 }}>
            Já recebeu um convite?
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<LoginIcon />}
            onClick={() => router.push("/protected/mesas")}
            sx={{ background: "linear-gradient(135deg, #5a6bcf 0%, #7b8ee8 100%)", fontWeight: 700, textTransform: "none", px: 4 }}
          >
            Entrar na minha mesa
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
