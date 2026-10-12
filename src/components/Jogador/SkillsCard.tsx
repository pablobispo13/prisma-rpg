"use client";

import { Box, Grid, Typography } from "@mui/material";
import { Character, Character_Attributes } from "../../types/types";
import { RollableActionCard } from "./RollableActionCard";
import { attributeConfig } from "./AttributeCard";
import { useCampaign } from "../../context/CampaignContext";
import { SimpleListItem } from "./SimpleListItem";

type Props = {
  character: Character;
  loading?: boolean;
  onRolled?: () => void;
};

/**
 * Perícias que o personagem possui (bônus ≠ 0), agrupadas pelo atributo
 * base — perícias com bônus 0 ficam ocultas. Cada card rola o teste
 * (1d20 + atributo + bônus da perícia) via POST /roll com skillKey; o valor
 * exibido é o modificador total que entra na rolagem.
 */
export function SkillsCard({ character, loading = false, onRolled }: Props) {
  const { activeCampaign } = useCampaign();
  const campaignSkills = activeCampaign?.skills ?? [];
  // Só mostra as perícias que o personagem possui (bônus diferente de 0)
  const skills = campaignSkills.filter((s) => (character.skills?.[s.key] ?? 0) !== 0);

  if (!loading && skills.length === 0) {
    return (
      <SimpleListItem>
        {campaignSkills.length === 0
          ? "Nenhuma perícia cadastrada na mesa — o mestre pode criar em Minhas Mesas → Editar mesa"
          : "Nenhuma perícia treinada — atribua os pontos no botão \"Perícias\" do cabeçalho"}
      </SimpleListItem>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {Character_Attributes.map(({ key, label }) => {
        const group = skills.filter((s) => s.baseAttribute === key.toUpperCase());
        if (group.length === 0) return null;
        const config = attributeConfig[key];
        const attributeValue = character[key] || 0;

        return (
          <Box key={key}>
            <Typography variant="caption" fontWeight="bold" sx={{ color: config.color }}>
              {label} ({attributeValue})
            </Typography>
            <Grid container spacing={1} mt={0.5}>
              {group.map((skill) => {
                const bonus = character.skills?.[skill.key] ?? 0;
                return (
                  <Grid key={skill.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <RollableActionCard
                      characterId={character.id}
                      skillKey={skill.key}
                      icon={config.icon}
                      color={config.color}
                      label={`${skill.label} · perícia ${bonus >= 0 ? "+" : ""}${bonus}`}
                      value={attributeValue + bonus}
                      loading={loading}
                      layout="row"
                      onRolled={onRolled}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        );
      })}
    </Box>
  );
}
