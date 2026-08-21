"use client";

import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CloseIcon from "@mui/icons-material/Close";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import { useScreenShareContext } from "../../context/ScreenShareContext";

export function ScreenSharePiP() {
  const { active, stream } = useScreenShareContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Autoplay com áudio é bloqueado pelo browser sem gesto do usuário —
  // começa mudo e o usuário liga o som manualmente.
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (active) setDismissed(false);
  }, [active]);

  if (!active || !stream || dismissed) return null;

  function handleFullscreen() {
    // Usa a API nativa do browser — não recria o <video>, stream continua
    videoRef.current?.requestFullscreen?.();
  }

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1200,
        width: collapsed ? 160 : 320,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid rgba(107,122,219,0.4)",
        backgroundColor: "#0e0e1a",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        transition: "width 0.25s ease",
      }}
    >
      {/* Barra de controle */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          py: 0.5,
          backgroundColor: "rgba(107,122,219,0.15)",
          gap: 0.5,
          cursor: collapsed ? "pointer" : "default",
          userSelect: "none",
        }}
        onClick={collapsed ? () => setCollapsed(false) : undefined}
      >
        <LiveTvIcon sx={{ fontSize: 14, color: "#6B7ADB", flexShrink: 0 }} />
        <Typography
          variant="caption"
          sx={{
            color: "#8B9DFF",
            fontWeight: 600,
            flex: 1,
            fontSize: 11,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {collapsed ? "Tela" : "Tela do mestre"}
        </Typography>

        {!collapsed && (
          <Tooltip title={muted ? "Ativar áudio" : "Silenciar"}>
            <IconButton
              size="small"
              onClick={() => setMuted((v) => !v)}
              sx={{ color: "#555", p: 0.25, "&:hover": { color: "#aaa" } }}
            >
              {muted ? <VolumeOffIcon sx={{ fontSize: 14 }} /> : <VolumeUpIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        )}

        {!collapsed && (
          <Tooltip title="Tela cheia">
            <IconButton
              size="small"
              onClick={handleFullscreen}
              sx={{ color: "#555", p: 0.25, "&:hover": { color: "#aaa" } }}
            >
              <FullscreenIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title={collapsed ? "Expandir" : "Minimizar"}>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
            sx={{ color: "#555", p: 0.25, "&:hover": { color: "#aaa" } }}
          >
            <Typography sx={{ fontSize: 12, lineHeight: 1, color: "inherit" }}>
              {collapsed ? "▲" : "▼"}
            </Typography>
          </IconButton>
        </Tooltip>

        <Tooltip title="Fechar">
          <IconButton
            size="small"
            onClick={() => setDismissed(true)}
            sx={{ color: "#555", p: 0.25, "&:hover": { color: "#f87171" } }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/*
        <video> SEMPRE montado — colapsar usa height:0 + overflow:hidden
        para não interromper a conexão WebRTC (diferente de display:none).
      */}
      <Box
        sx={{
          height: collapsed ? 0 : "auto",
          overflow: "hidden",
          transition: "height 0.25s ease",
        }}
      >
        <Box sx={{ width: "100%", aspectRatio: "16/9", backgroundColor: "#000" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </Box>
      </Box>
    </Box>
  );
}
