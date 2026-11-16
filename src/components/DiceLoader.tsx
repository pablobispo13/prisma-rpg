"use client";

import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import DiceLogo from "./DiceLogo";
import { FULL_HEIGHT } from "../lib/layout";

type Props = {
  /** Texto principal, ex: "Preparando o combate". As reticências são animadas. */
  message?: string;
  /**
   * Frases curtas que se alternam embaixo da mensagem (clima de mesa).
   * Passe [] para não mostrar nenhuma.
   */
  flavor?: string[];
  /**
   * "page": ocupa a altura útil da tela, centralizado (troca de página).
   * "inline": bloco compacto dentro de um card/lista.
   */
  variant?: "page" | "inline";
};

const DEFAULT_FLAVOR = [
  "Rolando iniciativa",
  "Afiando as lâminas",
  "Conferindo as fichas",
  "Consultando o mestre",
  "Acendendo as tochas",
];

// Um ciclo = dado cai rolando, quica e para mostrando o resultado
const CYCLE = 1.6;

/**
 * Carregamento com a identidade do app: o d20 da marca rolando, quicando e
 * parando num resultado, com uma sombra que acompanha o quique. Respeita
 * "reduzir movimento" do sistema (vira só um pulso suave).
 */
export default function DiceLoader({ message = "Carregando", flavor = DEFAULT_FLAVOR, variant = "page" }: Props) {
  const reduceMotion = useReducedMotion();
  const isPage = variant === "page";
  const size = isPage ? 72 : 40;

  // Face sorteada a cada ciclo — muda no meio do giro, quando o número
  // está de lado e a troca não aparece
  const [face, setFace] = useState(20);
  useEffect(() => {
    if (reduceMotion) return;
    const roll = () => setFace(1 + Math.floor(Math.random() * 20));
    // 1ª troca a 25% do ciclo (meio do giro); o intervalo começa a partir
    // dela para todas as trocas seguintes caírem no mesmo ponto do ciclo
    let id: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      roll();
      id = setInterval(roll, CYCLE * 1000);
    }, CYCLE * 250);
    return () => { clearTimeout(first); if (id) clearInterval(id); };
  }, [reduceMotion]);

  const [flavorIndex, setFlavorIndex] = useState(0);
  useEffect(() => {
    if (flavor.length < 2) return;
    const id = setInterval(() => setFlavorIndex((i) => (i + 1) % flavor.length), 2400);
    return () => clearInterval(id);
  }, [flavor.length]);

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={message}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isPage ? 2.5 : 1.5,
        py: isPage ? 4 : 2,
        px: 2,
        minHeight: isPage ? FULL_HEIGHT : undefined,
        width: "100%",
        textAlign: "center",
      }}
    >
      {/* Dado + sombra no "chão" */}
      {/* mt reserva o espaço do quique (o dado sobe acima da caixa) */}
      <Box sx={{ position: "relative", width: size * 1.6, height: size * 1.12, mt: `${size * 0.35}px`, display: "flex", justifyContent: "center" }}>
        <motion.div
          style={{ position: "absolute", top: 0 }}
          animate={
            reduceMotion
              ? { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }
              : {
                  // cai girando → quica → assenta (pausa com o resultado à mostra)
                  y: [-size * 0.35, 0, -size * 0.18, 0, 0],
                  rotate: [0, 300, 345, 360, 360],
                }
          }
          transition={{
            duration: reduceMotion ? 1.8 : CYCLE,
            times: reduceMotion ? undefined : [0, 0.45, 0.6, 0.72, 1],
            ease: "easeOut",
            repeat: Infinity,
          }}
        >
          <DiceLogo size={size} value={face} />
        </motion.div>

        {!reduceMotion && (
          <motion.div
            style={{
              position: "absolute",
              bottom: 0,
              width: size * 0.8,
              height: size * 0.12,
              borderRadius: "50%",
              background: "radial-gradient(ellipse, rgba(107,122,219,0.45) 0%, transparent 70%)",
            }}
            // sombra encolhe quando o dado sobe e cresce quando toca o chão
            animate={{ scaleX: [0.55, 1, 0.75, 1, 1], opacity: [0.35, 0.9, 0.55, 0.9, 0.9] }}
            transition={{ duration: CYCLE, times: [0, 0.45, 0.6, 0.72, 1], ease: "easeOut", repeat: Infinity }}
          />
        )}
      </Box>

      <Box>
        <Typography
          sx={{
            color: "#8B9DFF",
            fontWeight: 600,
            fontSize: isPage ? 16 : 13,
            letterSpacing: 0.5,
            // reticências animadas sem mexer na largura do texto
            "&::after": {
              content: '"…"',
              display: "inline-block",
              width: "1.2em",
              textAlign: "left",
              animation: reduceMotion ? "none" : "diceLoaderDots 1.2s steps(4, end) infinite",
              overflow: "hidden",
              verticalAlign: "bottom",
            },
            "@keyframes diceLoaderDots": {
              "0%": { width: 0 },
              "100%": { width: "1.2em" },
            },
          }}
        >
          {message}
        </Typography>

        {isPage && flavor.length > 0 && (
          <motion.div
            key={flavorIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Typography sx={{ color: "#5c6280", fontSize: 12, mt: 0.75 }}>
              {flavor[flavorIndex % flavor.length]}
            </Typography>
          </motion.div>
        )}
      </Box>
    </Box>
  );
}
