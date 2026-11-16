"use client";

import { useEffect, useState } from "react";
import { CharacterSheet } from "../Character/CharacterSheet";
import { Button, Stack } from "@mui/material";
import { Character } from "../../types/types";
import api from "../../lib/api";
import { createCharacterTemplate } from "../../lib/characterTemplate";
import { DiceInputRoller } from "../DiceInputRoller";
import Link from "next/link";
import { FULL_HEIGHT } from "../../lib/layout";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

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
        // Personagem transformado aparece na lista com o id da forma ativa;
        // o link pode ter sido aberto com o id de qualquer forma do grupo
        const found = characters.find(
          (c) =>
            c.id === forcedCharacterId ||
            c.formGroup?.primaryId === forcedCharacterId ||
            c.formGroup?.options.some((o) => o.id === forcedCharacterId)
        );
        // Visão forçada nunca cai em outra ficha: se o id não existe mais,
        // melhor não mostrar nada do que abrir o personagem errado
        setCharacter(found ?? null);
        return;
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
    return <Stack display={"flex"} height={FULL_HEIGHT} justifyContent={"center"} flexDirection={"row"} gap={2} alignItems={"center"} px={2}>
      {forcedCharacterId ? (
        <Button disabled color="warning">
          Personagem não encontrado nesta mesa
        </Button>
      ) : (
        <Button variant="outlined" onClick={() => createCharacterTemplate().finally(() => getCharacters())}>
          Criar personagem de template
        </Button>
      )}
    </Stack>;
  }

  return (
    <>
      {isSpectator && (
        <Stack mb={2} alignItems={"center"} px={2} pt={1}>
          {/* Em nova aba (navegador) tanto faz; no PWA instalado a ficha abre
              na mesma janela e esse é o caminho de volta (ver openAppPage) */}
          <Button component={Link} href="/protected/" startIcon={<ArrowBackIcon />} size="small" sx={{ alignSelf: "flex-start" }}>
            Voltar à mesa
          </Button>
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
