"use client";

import { Stack, Button, Skeleton } from "@mui/material";
import { useState } from "react";
import { ActionPreset } from "@prisma/client";
import { PresetCard } from "./PresetCard";
import { Section } from "../Section";
import { PresetModal } from "./PresetModal";
import { SimpleListItem } from "../Jogador/SimpleListItem";

type Props = {
  characterId: string;
  presets: ActionPreset[];
  characterAttributes?: {
    strength: number;
    agility: number;
    vigor: number;
    intellect: number;
    presence: number;
  };
  canEdit?: boolean;
  loading?: boolean;
};

export function PresetsSection({
  characterId,
  presets,
  characterAttributes,
  canEdit,
  loading = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActionPreset | null>(null);

  // TRANSFORM (transformação) é auto-gerado ao criar uma forma, mas também
  // pode ser criado/editado manualmente aqui como qualquer outro preset —
  // PresetModal mostra um seletor de "Forma-alvo" no lugar de Alvo/Atributo
  const editablePresets = presets.filter(Boolean);

  return (
    <>
      <Section
        title="Habilidades"
        action={
          canEdit &&
          !loading && (
            <Button size="small" onClick={() => setOpen(true)}>
              + Habilidade
            </Button>
          )
        }
      >
        <Stack spacing={1.5}>
          {loading ? (
            Array(3)
              .fill(1)
              .map((_, index) => (
                <Skeleton
                  key={index}
                  variant="rectangular"
                  height={80}
                  sx={{ borderRadius: 2 }}
                />
              ))
          ) : editablePresets.length ? (
            editablePresets.map((preset) => {
              const attributeName =
                preset.attribute.toLowerCase() as keyof typeof characterAttributes;
              const attributeValue = characterAttributes?.[attributeName] || 0;

              return (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  characterAttribute={attributeValue}
                  canEdit={canEdit}
                  onEdit={() => {
                    setEditing(preset);
                    setOpen(true);
                  }}
                  onDelete={async () => {
                    // await getActionPresets();
                  }}
                />
              );
            })
          ) : (
            <SimpleListItem>Nenhuma habilidade cadastrada</SimpleListItem>
          )}
        </Stack>
      </Section>

      <PresetModal
        open={open}
        characterId={characterId}
        preset={editing}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}
