"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Stack,
  Button,
  Divider,
  Typography,
  Paper,
  Grid,
  IconButton,
  Skeleton,
} from "@mui/material";

import { Section } from "../Section";
import { SimpleListItem } from "../Jogador/SimpleListItem";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  ActionLog,
  ActionPresetType,
  Character,
  CharacterInventory,
} from "../../types/types";
import { CharacterStatsModal } from "./CharacterStatsModal";
import { useActiveCombats } from "../../lib/useActiveCombats";
import api from "../../lib/api";
import { Roller } from "../Jogador/Roller";
import { InventoryItemModal } from "../Inventory/InventoryItemModal";
import { PresetModal } from "../ActionPreset/PresetModal";
import { DiceInputRoller } from "../DiceInputRoller";
import { toast } from "react-toastify";
import { CombatCard } from "../Combat/CombatCard";
import Head from "next/head";
import { PresetCard } from "../ActionPreset/PresetCard";
import { InventoryItemCard } from "../Inventory/InventoryItemCard";
import { ActionLogCard } from "./ActionLogCard";
import { CharacterHeaderCard } from "./CharacterHeaderCard";
import { CharacterNotesModal } from "./CharacterNotesModal";
import { AttributeCard } from "../Jogador/AttributeCard";
import { RollableActionCard } from "../Jogador/RollableActionCard";
import { getActionColor, getActionIcon } from "../../lib/presetUtils";
import { LifeBarCard } from "../Jogador/LifeBarCard";
import { ScreenSharePiP } from "../Stream/ScreenSharePiP";
import { useCampaign } from "../../context/CampaignContext";
import { isNpc } from "../../lib/isNpc";

type Props = {
  characterLoaded: Character;
  isMasterView?: boolean;
  onClose?: () => void;
  onFormSwitched?: () => void;
};

export function CharacterSheet({
  characterLoaded,
  isMasterView = false,
  onClose,
  onFormSwitched,
}: Props) {
  const [item, setItem] = useState<CharacterInventory | undefined>();
  const [preset, setPreset] = useState<ActionPresetType | undefined>();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [editStatsOpen, setEditStatsOpen] = useState(false);
  const [notesModalField, setNotesModalField] = useState<"history" | "notes" | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const { activeCampaign } = useCampaign();
  const masterId = activeCampaign?.masterId ?? null;
  // Edita se for visão do mestre, ou se o personagem não é um NPC (i.e., pertence a um jogador)
  const canEdit = isMasterView || !isNpc(characterLoaded, masterId);
  // Habilidades marcadas como "da forma transformada" só são usáveis quando a
  // ficha exibida é a de uma forma (destransformado, elas ficam só na listagem)
  const isTransformedSheet = !!characterLoaded.primaryFormId;
  const presetUsable = (p: ActionPresetType) => isTransformedSheet || !p.transformedOnly;
  const { combats } = useActiveCombats();
  const [character, setCharacter] = useState<Character>(characterLoaded);
  const [actionPresets, setActionPresets] = useState<ActionPresetType[]>([]);
  const [inventory, setInventory] = useState<CharacterInventory[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // Testes de atributo (type TEST) viraram os cards clicáveis em "Atributos"
  // — não aparecem mais duplicados aqui, na caixa de ações rápidas.
  const quickActions = actionPresets.filter(
    (p) => p.allowOutOfCombat && p.type !== "TEST" && presetUsable(p)
  );

  const handleDelete = async (id: string) => {
    await api.delete(`/actionPreset/${id}`).then(() => {
      getActionPreset?.();
    });
  };

  async function getCharacter() {
    try {
      const res = await api.get(`/characters/${character.id}`);
      const characters: Character = res.data;
      setCharacter(characters);
    } catch {
      toast.error("Ocorreu um erro na requisição de obter o personagem");
    }
  }

  async function getActionPreset() {
    try {
      const res = await api.get(`/actionPreset`, {
        params: { characterId: character.id },
      });
      setActionPresets(res.data.presets);
    } catch {
      toast.error("Ocorreu um erro na requisição de obter os presets");
    }
  }
  async function getInventory() {
    try {
      const res = await api.post(`/inventory/`, {
        characterId: character.id,
        action: "list",
      });
      setInventory(res.data.items);
    } catch {
      toast.error("Ocorreu um erro na requisição de obter o inventario");
    }
  }
  async function getActionLogs() {
    try {
      const res = await api.get(`/actionLogs/`, {
        params: { characterId: character.id },
      });
      setActionLogs(res.data.actionLogs);
    } catch {
      toast.error("Ocorreu um erro na requisição de obter as rolagens");
    }
  }

  useEffect(() => {
    try {
      setLoading(true);
      getCharacter();
      getActionPreset();
      getInventory();
      getActionLogs();
    } finally {
      setLoading(false);
    }
  }, [character.id]);

  return (
    <>
    <Stack gap={2} sx={{ px: { xs: 1, sm: 2 }, ...(quickActions.length > 0 ? { pr: { lg: "336px" } } : {}) }}>
      <Head>
        <title>Ficha {character.name}</title>
      </Head>
      {!isMasterView && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            gap: 3,
            marginTop: 2,
            background: `
              radial-gradient(circle at 30% 50%, rgba(107, 122, 219, 0.1) 0%, transparent 50%),
              linear-gradient(135deg, rgba(15, 15, 30, 0.8), rgba(26, 26, 46, 0.8))
            `,
            border: "1px solid rgba(107, 122, 219, 0.2)",
            borderRadius: { xs: 2, sm: 3 },
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          <Stack gap={3}>
            {/* Header */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography
                variant="h5"
                fontWeight="bold"
                sx={{
                  fontSize: { xs: "1.3rem", sm: "1.5rem" },
                  background: "linear-gradient(135deg, #6B7ADB, #8B9DFF)",
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Combates Ativos
              </Typography>
            </Stack>

            {/* Conteúdo */}
            {loading ? (
              <Grid container spacing={2}>
                {Array(3)
                  .fill(1)
                  .map((item, index) => (
                    <CombatCard key={index} loading={loading} />
                  ))}
              </Grid>
            ) : combats.length === 0 ? (
              <Typography
                color="text.secondary"
                sx={{ fontSize: { xs: "0.9rem", sm: "1rem" } }}
              >
                Nenhum combate ativo no momento.
              </Typography>
            ) : (
              <Grid container spacing={2}>
                {combats.map((combat) => (
                  <CombatCard key={combat.id} combat={combat} />
                ))}
              </Grid>
            )}
          </Stack>
        </Paper>
      )}
      {!isMasterView && !loading && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            gap: 3,
            marginTop: 2,
            display: "flex",
            justifyContent: "center",
            background: `
              radial-gradient(circle at 70% 50%, rgba(239, 83, 80, 0.08) 0%, transparent 50%),
              linear-gradient(135deg, rgba(15, 15, 30, 0.8), rgba(26, 26, 46, 0.8))
            `,
            border: "1px solid rgba(239, 83, 80, 0.2)",
            borderRadius: { xs: 2, sm: 3 },
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          <DiceInputRoller characterId={character.id} />
        </Paper>
      )}
      <Box
        sx={{
          position: "relative",
          p: 0,
          minWidth: { xs: "100%", sm: 650 },
          maxWidth: { xs: "100%", sm: 1000 },
          mx: "auto",
          width: { xs: "100%", sm: "auto" },
          marginBottom: 2,
          borderRadius: { xs: 2, sm: 4 },
          overflow: "hidden",
          color: "#fff",

          // Background com múltiplas camadas
          background: `
            radial-gradient(circle at 20% 50%, rgba(107, 122, 219, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(239, 83, 80, 0.1) 0%, transparent 50%),
            linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16213e 100%)
          `,

          // Borda com gradiente
          border: "2px solid",
          borderImage:
            "linear-gradient(135deg, rgba(107, 122, 219, 0.5), rgba(239, 83, 80, 0.3)) 1",

          // Sombra múltipla sofisticada
          boxShadow: `
            0 0 60px rgba(107, 122, 219, 0.2),
            0 0 30px rgba(0, 0, 0, 0.8),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,

          // Elemento decorativo de fundo
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
              radial-gradient(circle 600px at 20% 10%, rgba(107, 122, 219, 0.1) 0%, transparent 80%),
              radial-gradient(circle 400px at 90% 90%, rgba(239, 83, 80, 0.05) 0%, transparent 80%)
            `,
            pointerEvents: "none",
          },

          // Padrão sutil de grade
          "&::after": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, 0.01) 25%, rgba(255, 255, 255, 0.01) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.01) 75%, rgba(255, 255, 255, 0.01) 76%, transparent 77%, transparent),
              linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, 0.01) 25%, rgba(255, 255, 255, 0.01) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.01) 75%, rgba(255, 255, 255, 0.01) 76%, transparent 77%, transparent)
            `,
            backgroundSize: "50px 50px",
            pointerEvents: "none",
          },
        }}
      >
        {/* Conteúdo Principal */}
        <Box sx={{ position: "relative", zIndex: 1, p: { xs: 2.5, sm: 4 } }}>
          <Stack spacing={{ xs: 2.5, sm: 4 }}>
            {/* Cabeçalho */}
            <CharacterHeaderCard
              loading={loading}
              character={character}
              onEditAction={() => {
                setEditStatsOpen(true);
              }}
              onHistoryAction={() => setNotesModalField("history")}
              onNotesAction={() => setNotesModalField("notes")}
              canSwitchForm={canEdit}
              onFormSwitched={onFormSwitched}
            />

            {/* Vida */}
            <LifeBarCard
              loading={loading}
              life={character.life}
              maxLife={character.maxLife}
            />

            <Divider sx={{ borderColor: "rgba(255,255,255,.1)" }} />

            {/* Atributos — cada card é clicável e rola o teste do atributo */}
            <Section title="Atributos">
              <AttributeCard loading={loading} character={character} presets={actionPresets} />
            </Section>

            {/* Inventário */}
            <Section
              title="Inventário"
              collapsible
              storageKey={`sheet-section-inventory-${character.id}`}
              action={
                !loading &&
                canEdit && (
                  <Button size="small" onClick={() => setInventoryOpen(true)}>
                    Adicionar
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
                ) : inventory.length ? (
                  inventory.map((item) => (
                    <InventoryItemCard
                      key={item.id}
                      characterId={character.id}
                      item={item}
                      canEdit={canEdit}
                      onRemove={() => {
                        getInventory();
                        setInventoryOpen(false);
                        setItem(undefined);
                      }}
                      onEdit={() => {
                        setInventoryOpen(true);
                        setItem(item);
                      }}
                    />
                  ))
                ) : (
                  <SimpleListItem>Inventário vazio</SimpleListItem>
                )}
              </Stack>
            </Section>

            {/* Habilidades / Presets */}
            <Section
              title="Habilidades"
              collapsible
              storageKey={`sheet-section-presets-${character.id}`}
              action={
                !loading &&
                canEdit && (
                  <Button size="small" onClick={() => setPresetOpen(true)}>
                    Adicionar
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
                ) : actionPresets.length ? (
                  <>
                    {actionPresets.map((preset) => {
                      // Atributo fixo é campo direto do personagem; customizado
                      // vem de customAttributes (ver Minhas Mesas > Atributos customizados)
                      const attributeKey = preset.attribute.toLowerCase();
                      const isFixedAttr = ["strength", "agility", "vigor", "intellect", "presence"].includes(attributeKey);
                      const attributeValue = isFixedAttr
                        ? (character[attributeKey as keyof Character] as number) || 0
                        : character.customAttributes?.[attributeKey] ?? 0;
                      const roller =
                        preset.type !== "REACT" && preset.type !== "SKILL" && presetUsable(preset) ? (
                          <Roller
                            actionPresetId={preset.id}
                            characterId={character.id}
                          />
                        ) : undefined;

                      return (
                        <div key={preset.id}>
                          <PresetCard
                            preset={preset}
                            character={character}
                            characterAttribute={attributeValue}
                            canEdit={canEdit}
                            onEdit={() => {
                              setPresetOpen(true);
                              setPreset(preset);
                            }}
                            onDelete={async () => {
                              handleDelete(preset.id);
                            }}
                            actionButton={roller}
                          />
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <SimpleListItem>Nenhuma habilidade cadastrada</SimpleListItem>
                )}
              </Stack>
            </Section>

            {/* Rolagens rápidas — travada na direita da tela, acompanha o
                scroll (position:fixed de verdade: sticky não funciona aqui
                porque o Box decorativo ancestral usa overflow:hidden, e
                qualquer overflow != visible num ancestral quebra sticky) */}
            {!loading && quickActions.length > 0 && (
              <Box
                sx={{
                  position: { xs: "static", lg: "fixed" },
                  width: { xs: "100%", lg: 280 },
                  top: { lg: 88 },
                  right: { lg: 24 },
                  maxHeight: { lg: "calc(100vh - 112px)" },
                  overflowY: { lg: "auto" },
                  zIndex: { lg: 10 },
                }}
              >
                <Section title="Rolagens rá">
                  <Stack spacing={1.5}>
                    {quickActions.map((preset) => (
                      <RollableActionCard
                        key={preset.id}
                        characterId={character.id}
                        actionPresetId={preset.id}
                        icon={getActionIcon(preset.type)}
                        color={getActionColor(preset.type)}
                        label={preset.name}
                        layout="row"
                      />
                    ))}
                  </Stack>
                </Section>
              </Box>
            )}

            {/* Rolagens */}
            <Section
              title="Rolagens Recentes"
              collapsible
              storageKey={`sheet-section-rolls-${character.id}`}
              action={
                !loading &&
                canEdit && (
                  <IconButton size="small" onClick={() => getActionLogs()}>
                    <RefreshIcon />
                  </IconButton>
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
                ) : actionLogs && actionLogs.length ? (
                  actionLogs.map((actionLog: ActionLog) => (
                    <ActionLogCard key={actionLog.id} actionLog={actionLog} />
                  ))
                ) : (
                  <SimpleListItem>Nenhuma rolagem recente</SimpleListItem>
                )}
              </Stack>
            </Section>

            {/* Ações gerais */}
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              {isNpc(character, masterId) && (
                <Button variant="outlined" onClick={onClose}>
                  Fechar
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>

        {/* Modais */}
        <InventoryItemModal
          open={inventoryOpen}
          onClose={() => {
            getInventory();
            setInventoryOpen(false);
            setItem(undefined);
          }}
          characterId={character.id}
          item={item}
        />

        <PresetModal
          open={presetOpen}
          onClose={() => {
            getActionPreset();
            setPresetOpen(false);
            setPreset(undefined);
          }}
          characterId={character.id}
          preset={preset}
        />

        <CharacterStatsModal
          open={editStatsOpen}
          character={character}
          onClose={() => {
            getCharacter();
            setEditStatsOpen(false);
          }}
        />

        <CharacterNotesModal
          open={notesModalField !== null}
          field={notesModalField ?? "history"}
          character={character}
          canEdit={canEdit}
          onClose={() => setNotesModalField(null)}
          onSaved={getCharacter}
        />
      </Box>
    </Stack>

    <ScreenSharePiP />
    </>
  );
}
