"use client";

import { Grid } from "@mui/material";
import { ActionPresetType, Character, Character_Attributes } from "../../types/types";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import SpeedIcon from "@mui/icons-material/Speed";
import FavoriteIcon from "@mui/icons-material/Favorite";
import SchoolIcon from "@mui/icons-material/School";
import EmojiPeopleIcon from "@mui/icons-material/EmojiPeople";
import { RollableActionCard } from "./RollableActionCard";

type Props = {
  character: Character;
  presets?: ActionPresetType[];
  loading?: boolean;
};

const attributeConfig: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  strength: { icon: <FitnessCenterIcon />, color: "#EF5350", label: "Força" },
  agility: { icon: <SpeedIcon />, color: "#29B6F6", label: "Agilidade" },
  vigor: { icon: <FavoriteIcon />, color: "#66BB6A", label: "Vigor" },
  intellect: { icon: <SchoolIcon />, color: "#AB47BC", label: "Inteligência" },
  presence: { icon: <EmojiPeopleIcon />, color: "#FFA726", label: "Presença" },
};

export function AttributeCard({ character, presets = [], loading = false }: Props) {
  return (
    <Grid container spacing={{ xs: 1, sm: 1.5 }}>
      {Character_Attributes.map(({ key, label }) => {
        const config = attributeConfig[key];
        const value = character[key] || 0;
        // Preset "Teste <Atributo>" auto-gerado por personagem (type TEST,
        // attribute = atributo em maiúsculo) — clicar no card rola direto
        const testPreset = presets.find(
          (p) => p.type === "TEST" && p.attribute === key.toUpperCase()
        );

        return (
          <Grid key={key}>
            <RollableActionCard
              characterId={character.id}
              actionPresetId={testPreset?.id}
              icon={config.icon}
              color={config.color}
              label={label}
              value={value}
              loading={loading}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}
