import { useId } from "react";

type DiceLogoProps = {
  /** Tamanho do lado do SVG em px. */
  size?: number;
  /** Exibe o número "20" na face central. */
  showNumber?: boolean;
  /** Aplica o brilho (drop-shadow) característico da marca. */
  glow?: boolean;
};

/**
 * Logo do sistema: um d20 facetado no gradiente índigo da marca.
 * Uma forma, muitas faces — combina com a proposta de sistema universal.
 */
export default function DiceLogo({
  size = 28,
  showNumber = true,
  glow = true,
}: DiceLogoProps) {
  // useId evita colisão de ids de gradiente quando há vários logos na tela.
  const uid = useId().replace(/:/g, "");
  const strokeId = `diceStroke-${uid}`;
  const fillId = `diceFill-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="Logo do sistema"
      style={{
        display: "block",
        filter: glow ? "drop-shadow(0 0 12px rgba(107,122,219,0.4))" : "none",
      }}
    >
      <defs>
        <linearGradient id={strokeId} x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="#A6B4FF" />
          <stop offset="100%" stopColor="#6B7ADB" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="100">
          <stop offset="0%" stopColor="rgba(139,157,255,0.20)" />
          <stop offset="100%" stopColor="rgba(107,122,219,0.05)" />
        </linearGradient>
      </defs>

      {/* Facetas internas (espinhas do icosaedro) */}
      <g
        stroke={`url(#${strokeId})`}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.55}
      >
        <line x1="50" y1="20" x2="50" y2="4" />
        <line x1="50" y1="20" x2="10" y2="27" />
        <line x1="50" y1="20" x2="90" y2="27" />
        <line x1="26" y1="64" x2="10" y2="73" />
        <line x1="26" y1="64" x2="50" y2="96" />
        <line x1="74" y1="64" x2="90" y2="73" />
        <line x1="74" y1="64" x2="50" y2="96" />
      </g>

      {/* Contorno do dado (hexágono) */}
      <polygon
        points="50,4 90,27 90,73 50,96 10,73 10,27"
        fill={`url(#${fillId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth={4.5}
        strokeLinejoin="round"
      />

      {/* Face central */}
      <polygon
        points="50,20 74,64 26,64"
        fill="none"
        stroke={`url(#${strokeId})`}
        strokeWidth={3}
        strokeLinejoin="round"
      />

      {showNumber && (
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'Rubik', sans-serif"
          fontSize="24"
          fontWeight={800}
          fill="#A6B4FF"
        >
          20
        </text>
      )}
    </svg>
  );
}
