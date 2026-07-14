"use client";

import { useEffect, useState } from "react";
import { CharacterSheet } from "../Character/CharacterSheet";
import { Button, Stack } from "@mui/material";
import { Character } from "../../types/types";
import api from "../../lib/api";
import { createCharacterTemplate } from "../../lib/characterTemplate";
import { DiceInputRoller } from "../DiceInputRoller";

type Props = {
  isSpectator?: boolean;
  forcedCharacterId?: string | null;
};

export default function MesaJogador({ forcedCharacterId, isSpectator = false }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState<boolean>(false);
  const [autoCreateAttempted, setAutoCreateAttempted] = useState(false);

  async function getCharacters() {
    setLoadingCharacter(true);

    try {
      const res = await api.get("/characters");
      const characters: Character[] = res.data.characters;

      if (forcedCharacterId) {
        // Personagem transformado aparece na lista com o id da forma ativa
        const found = characters.find(
          (c) => c.id === forcedCharacterId || c.formGroup?.primaryId === forcedCharacterId
        );
        if (found) {
          setCharacter(found);
          return;
        }
      }

      if (characters.length === 0 && !autoCreateAttempted) {
        setAutoCreateAttempted(true);
        try {
          await createCharacterTemplate();
        } catch {
          // If auto-creation fails, allow manual creation via button.
        }
        await getCharacters();
        return;
      }

      setCharacter(characters[0] ?? null);
    } finally {
      setLoadingCharacter(false);
    }
  }

  useEffect(() => {
    getCharacters();
  }, [forcedCharacterId]);

  if (loadingCharacter) return <>Carregando...</>
  if (!character) {
    return <Stack display={"flex"} height={"calc(100vh - 64px)"} justifyContent={"center"} flexDirection={"row"} gap={2} alignItems={"center"}>
      <Button variant="outlined" onClick={() => createCharacterTemplate().finally(() => getCharacters())}>
        Criar personagem de template
      </Button>
    </Stack>;
  }

  return (
    <>
      {isSpectator && (
        <Stack mb={2} alignItems={"center"}>
          <Button disabled color="warning">
            Visualização de personagem específica
          </Button>
          <DiceInputRoller characterId={character.id} />
        </Stack>
      )}

      <CharacterSheet
        key={character.id}
        characterLoaded={character}
        isMasterView={isSpectator}
        onFormSwitched={() => getCharacters()}
      />
    </>
  );
}
