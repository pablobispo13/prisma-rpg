"use client";

import { Box, Stack, Typography, Chip, Divider } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

interface RollBreakdownProps {
  roll: any;
  succeeded?: boolean;
  targetDefense?: number;
  showDamage?: boolean;
  damageRolls?: number[];
  damageModifier?: number;
}

/** Cor do valor de um dado individual: crítico natural verde, 1 natural vermelho. */
function dieColor(value: number, diceFormula: string): string {
  const isD20 = /d20/i.test(diceFormula);
  if (isD20 && value === 20) return "#4ade80";
  if (isD20 && value === 1) return "#f87171";
  return "#60a5fa";
}

export function RollBreakdown({
  roll,
  succeeded,
  targetDefense,
  showDamage = false,
  damageRolls,
  damageModifier = 0,
}: RollBreakdownProps) {
  const diceSum = roll.rolls.reduce((a: number, b: number) => a + b, 0);
  const successColor = succeeded ? "#4ade80" : "#f87171";
  const successIcon = succeeded ? <CheckCircleIcon /> : <CancelIcon />;

  // roll.modifier já é o modificador puro (atributo + bônus), separado dos dados
  const attackModifier: number = roll.modifier ?? 0;
  const modifierText = attackModifier > 0 ? `+${attackModifier}` : `${attackModifier}`;

  // Dano: usa a prop quando fornecida, senão os impactRolls salvos na rolagem
  const dmgRolls: number[] | undefined =
    damageRolls ?? (roll.impactRolls?.length ? roll.impactRolls : undefined);
  // Fórmula já resolvida (ex: "1d6+8") gravada na própria rolagem — prefere
  // a essa em vez de preset.impactFormula "cru" (que pode ter {{atributo}})
  const impactFormulaText: string | null = roll.impactFormulaResolved ?? roll.preset?.impactFormula ?? null;
  const dmgDiceSum = dmgRolls?.reduce((a: number, b: number) => a + b, 0) ?? 0;
  // Diferença entre o dano final e os dados = atributo/bônus (e crítico, se houver)
  const dmgBonus = damageModifier > 0
    ? damageModifier
    : dmgRolls && roll.damage
      ? roll.damage - dmgDiceSum
      : 0;

  return (
    <Stack spacing={2}>
      {/* Ataque/Teste */}
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="caption" color="text.secondary" fontWeight="600">
            TESTE/ATAQUE
          </Typography>
          {succeeded !== undefined && (
            <Chip
              icon={successIcon}
              label={succeeded ? "Acertou" : "Falhou"}
              size="small"
              sx={{
                backgroundColor: `${successColor}20`,
                color: successColor,
                fontWeight: "bold",
              }}
            />
          )}
        </Stack>

        <Box sx={{ fontFamily: "monospace", fontSize: 12, backgroundColor: "#1a1a2e", p: 1.5, borderRadius: 1 }}>
          <Stack spacing={0.8}>
            {/* Equação completa: 1d20 (19) + 15 = 34 */}
            <Typography sx={{ fontFamily: "monospace" }}>
              <span style={{ color: "#fbbf24" }}>{roll.diceRolled}</span>
              {" ("}
              {roll.rolls.map((v: number, i: number) => (
                <span key={i}>
                  {i > 0 && ", "}
                  <span style={{ color: dieColor(v, roll.diceRolled), fontWeight: 700 }}>{v}</span>
                </span>
              ))}
              {roll.droppedRolls?.length > 0 && (
                <span style={{ color: "#666" }}>
                  {", "}
                  {roll.droppedRolls.map((v: number, i: number) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <span style={{ textDecoration: "line-through" }} title="Rolado, mas não contado (mantém o maior)">{v}</span>
                    </span>
                  ))}
                </span>
              )}
              {")"}
              {attackModifier !== 0 && (
                <span style={{ color: "#a78bfa" }}> {modifierText}</span>
              )}
              {" = "}
              <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14 }}>{roll.total}</span>
            </Typography>

            <Stack spacing={0.4} sx={{ pl: 1.5, borderLeft: "2px solid #374151" }}>
              <Typography sx={{ fontFamily: "monospace", fontSize: 11 }}>
                ├─ Dado:{" "}
                <span style={{ color: "#4ade80" }}>{diceSum}</span>
              </Typography>

              {attackModifier !== 0 && (
                <Typography sx={{ fontFamily: "monospace", fontSize: 11 }}>
                  ├─ Modificador:{" "}
                  <span style={{ color: "#a78bfa" }}>{modifierText}</span>
                </Typography>
              )}

              <Typography sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold" }}>
                └─ TOTAL:{" "}
                <span style={{ color: "#fbbf24", fontSize: 13 }}>
                  {roll.total}
                  {roll.critical && (
                    <span style={{ color: "#f97316", marginLeft: 4 }}>⚡ CRÍTICO</span>
                  )}
                </span>
                {targetDefense !== undefined && (
                  <span style={{ color: "#777", fontWeight: 400 }}>
                    {" "}vs DEF <span style={{ color: "#60a5fa" }}>{targetDefense}</span>
                  </span>
                )}
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Box>

      {/* Dano (se houver e > 0) */}
      {showDamage && roll.damage > 0 && (
        <>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight="600" mb={1} display="block">
              DANO
            </Typography>

            <Box sx={{ fontFamily: "monospace", fontSize: 12, backgroundColor: "#1a1a2e", p: 1.5, borderRadius: 1 }}>
              <Stack spacing={0.8}>
                {(impactFormulaText || dmgRolls) && (
                  <Typography sx={{ fontFamily: "monospace" }}>
                    {impactFormulaText && (
                      <span style={{ color: "#fbbf24" }}>{impactFormulaText}</span>
                    )}
                    {dmgRolls && (
                      <>
                        {" ("}<span style={{ color: "#60a5fa" }}>{dmgRolls.join(", ")}</span>{")"}
                        {dmgBonus > 0 && <span style={{ color: "#a78bfa" }}> +{dmgBonus}</span>}
                        {" = "}
                        <span style={{ color: "#f87171", fontWeight: 700 }}>{roll.damage}</span>
                      </>
                    )}
                  </Typography>
                )}

                <Stack spacing={0.4} sx={{ pl: 1.5, borderLeft: "2px solid #374151" }}>
                  {dmgRolls && (
                    <Typography sx={{ fontFamily: "monospace", fontSize: 11 }}>
                      ├─ Dado:{" "}
                      <span style={{ color: "#4ade80" }}>{dmgDiceSum}</span>
                    </Typography>
                  )}

                  {dmgBonus > 0 && (
                    <Typography sx={{ fontFamily: "monospace", fontSize: 11 }}>
                      ├─ Bônus{roll.critical ? " (atributo × crítico já aplicado)" : ""}:{" "}
                      <span style={{ color: "#a78bfa" }}>+{dmgBonus}</span>
                    </Typography>
                  )}

                  <Typography sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold" }}>
                    └─ TOTAL DANO:{" "}
                    <span style={{ color: "#f87171", fontSize: 13 }}>
                      {roll.damage}
                      {roll.critical && roll.preset?.critMultiplier && (
                        <span style={{ color: "#f97316", marginLeft: 4 }}>x{roll.preset.critMultiplier}</span>
                      )}
                    </span>
                  </Typography>
                </Stack>
              </Stack>
            </Box>
          </Box>
        </>
      )}

      {/* Cura (se houver) */}
      {showDamage && (roll as any).healing && (roll as any).healing > 0 && (
        <>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight="600" mb={1} display="block">
              CURA
            </Typography>

            <Box sx={{ fontFamily: "monospace", fontSize: 12, backgroundColor: "#1a1a2e", p: 1.5, borderRadius: 1 }}>
              <Stack spacing={0.4} sx={{ pl: 1.5, borderLeft: "2px solid #374151" }}>
                <Typography sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold" }}>
                  └─ TOTAL CURA:{" "}
                  <span style={{ color: "#4ade80", fontSize: 13 }}>+{(roll as any).healing}</span>
                </Typography>
              </Stack>
            </Box>
          </Box>
        </>
      )}
    </Stack>
  );
}
