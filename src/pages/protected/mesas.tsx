"use client";

import { useEffect, useState } from "react";
import {
  Box, Button, Card, CardContent, Typography, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Stack, Chip, IconButton, Tooltip,
  FormControlLabel, Switch, MenuItem, Divider, List, ListItem, ListItemText,
  Autocomplete,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LoginIcon from "@mui/icons-material/Login";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ArchiveIcon from "@mui/icons-material/Archive";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import LogoutIcon from "@mui/icons-material/Logout";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useCampaign, CampaignSummary } from "../../context/CampaignContext";
import { campaignSchema, CampaignForm, joinSchema, JoinForm } from "../../validation/campaign";
import { DEFAULT_DEFENSE_FORMULA, DEFAULT_MAX_LIFE_FORMULA } from "../../lib/characterCalculations";
import { FORMULA_VARIABLES } from "../../lib/formula";
import { CustomAttributeType } from "../../types/types";
import DeleteIcon from "@mui/icons-material/Delete";

const EXPIRATION_OPTIONS = [
  { label: "Não expira", value: 0 },
  { label: "1 hora", value: 1 },
  { label: "24 horas", value: 24 },
  { label: "7 dias", value: 24 * 7 },
];

export default function MesasPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { campaigns, activeCampaign, setActiveCampaign, reload, loading } = useCampaign();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CampaignSummary | null>(null);
  const [inviteTarget, setInviteTarget] = useState<CampaignSummary | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [inviteExpHours, setInviteExpHours] = useState<number>(24);
  const [inviteMaxUses, setInviteMaxUses] = useState<string>("");

  // Limite de reações por rodada (edição da mesa)
  const [editReactionsPerRound, setEditReactionsPerRound] = useState<string>("");

  // Cor de destaque da imagem do personagem ("" = padrão do sistema)
  const [editImageColor, setEditImageColor] = useState<string>("");

  // Dia do mundo (usos por dia de habilidades)
  const [advanceDayLoading, setAdvanceDayLoading] = useState(false);
  const [jumpToDay, setJumpToDay] = useState<string>("");

  // Custo de sanidade automático por uso de habilidade
  const [editAbilitySanityCost, setEditAbilitySanityCost] = useState<string>("");

  // Atributos customizados (Maestria, Sorte...) — CRUD próprio, fora do PATCH da mesa
  const [newAttrLabel, setNewAttrLabel] = useState("");
  const [newAttrDefault, setNewAttrDefault] = useState("0");
  const [attrSaving, setAttrSaving] = useState(false);

  // Admin: atribuir mesa a um mestre ao criar
  type AdminUserOption = {
    id: string;
    username: string;
    email: string;
    role: "MESTRE" | "JOGADOR";
  };
  const [userOptions, setUserOptions] = useState<AdminUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState<AdminUserOption | null>(null);
  const [userQuery, setUserQuery] = useState("");

  useEffect(() => {
    if (!createOpen || !user?.isAdmin) return;
    let cancelled = false;
    setUsersLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/admin/users", {
          params: userQuery ? { q: userQuery } : {},
          silent: true,
        });
        if (!cancelled) setUserOptions(data.users ?? []);
      } catch {
        if (!cancelled) setUserOptions([]);
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [createOpen, userQuery, user?.isAdmin]);

  const createForm = useForm<CampaignForm>({
    resolver: yupResolver(campaignSchema),
    defaultValues: { name: "", description: "" },
  });
  const editForm = useForm<CampaignForm>({
    resolver: yupResolver(campaignSchema),
    defaultValues: { name: "", description: "", defenseFormula: "", maxLifeFormula: "" },
  });
  const joinForm = useForm<JoinForm>({
    resolver: yupResolver(joinSchema),
    defaultValues: { code: "" },
  });

  const refresh = () => reload({ includeArchived });

  const enterCampaign = (campaignId: string) => {
    const target = campaigns.find((c) => c.id === campaignId);
    if (target) setActiveCampaign(target);
    router.push("/protected/");
  };

  const handleCreate = createForm.handleSubmit(async (values) => {
    if (!selectedMaster) {
      toast.error("Selecione um mestre");
      return;
    }
    try {
      const payload: Record<string, unknown> = { ...values, masterId: selectedMaster.id };

      const { data } = await api.post("/campaigns", payload);
      toast.success(`Mesa criada para ${selectedMaster.username}`);
      setCreateOpen(false);
      createForm.reset({ name: "", description: "" });
      setSelectedMaster(null);
      setUserQuery("");
      await refresh();
    } catch {}
  });

  const handleJoin = joinForm.handleSubmit(async (values) => {
    try {
      const { data } = await api.post("/campaigns/join", { code: values.code });
      toast.success(data.alreadyMember ? "Você já era membro" : `Entrou em ${data.campaignName}`);
      setJoinOpen(false);
      joinForm.reset({ code: "" });
      await refresh();
    } catch {}
  });

  const openInviteDialog = (campaign: CampaignSummary) => {
    setInviteTarget(campaign);
    setInviteExpHours(24);
    setInviteMaxUses("");
  };

  const buildInviteUrl = (code: string) => {
    if (typeof window === "undefined") return code;
    return `${window.location.origin}/protected/join?code=${code}`;
  };

  const handleGenerateInvite = async () => {
    if (!inviteTarget) return;
    try {
      const payload: { expiresInHours?: number; maxUses?: number } = {};
      if (inviteExpHours > 0) payload.expiresInHours = inviteExpHours;
      const max = parseInt(inviteMaxUses, 10);
      if (!isNaN(max) && max > 0) payload.maxUses = max;

      const { data } = await api.post(`/campaigns/${inviteTarget.id}/invite`, payload);
      const url = buildInviteUrl(data.code);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success(`Link de convite copiado (${data.code})`);
      await refresh();
    } catch {}
  };

  const handleRevokeInvite = async (campaignId: string, inviteId: string) => {
    try {
      await api.patch(`/campaigns/${campaignId}/invite`, { inviteId, active: false });
      toast.success("Convite revogado");
      await refresh();
    } catch {}
  };

  const handleRemoveMember = async (campaignId: string, userId: string, username: string) => {
    if (!confirm(`Remover ${username} da mesa?`)) return;
    try {
      await api.delete(`/campaigns/${campaignId}/members/${userId}`);
      toast.success(`${username} removido`);
      await refresh();
    } catch {}
  };

  const handleLeave = async (campaignId: string) => {
    if (!user) return;
    if (!confirm("Deseja sair desta mesa?")) return;
    try {
      await api.delete(`/campaigns/${campaignId}/members/${user.id}`);
      toast.success("Você saiu da mesa");
      if (activeCampaign?.id === campaignId) setActiveCampaign(null);
      await refresh();
    } catch {}
  };

  const handleArchiveToggle = async (campaign: CampaignSummary) => {
    const archiving = !campaign.archivedAt;
    if (archiving && !confirm("Arquivar esta mesa? Ela some das listagens ativas mas pode ser restaurada.")) return;
    try {
      await api.patch(`/campaigns/${campaign.id}`, { archived: archiving });
      toast.success(archiving ? "Mesa arquivada" : "Mesa restaurada");
      if (archiving && activeCampaign?.id === campaign.id) setActiveCampaign(null);
      await refresh();
    } catch {}
  };

  const openEditDialog = (c: CampaignSummary) => {
    setEditTarget(c);
    editForm.reset({
      name: c.name,
      description: c.description ?? "",
      defenseFormula: c.defenseFormula ?? "",
      maxLifeFormula: c.maxLifeFormula ?? "",
    });
    setEditReactionsPerRound(c.reactionsPerRound == null ? "" : String(c.reactionsPerRound));
    setEditImageColor(c.characterImageColor ?? "");
    setEditAbilitySanityCost(c.abilitySanityCost == null ? "" : String(c.abilitySanityCost));
    setJumpToDay("");
    setNewAttrLabel("");
    setNewAttrDefault("0");
  };

  const handleAddCustomAttribute = async () => {
    if (!editTarget || !newAttrLabel.trim()) return;
    setAttrSaving(true);
    try {
      const { data } = await api.post(`/campaigns/${editTarget.id}/attributes`, {
        label: newAttrLabel.trim(),
        defaultValue: newAttrDefault === "" ? 0 : Number(newAttrDefault),
      });
      toast.success(`Atributo "${data.label}" criado e aplicado a todos os personagens da mesa`);
      setNewAttrLabel("");
      setNewAttrDefault("0");
      setEditTarget((prev) => (prev ? { ...prev, customAttributes: [...prev.customAttributes, data] } : prev));
      await refresh();
    } catch {}
    finally { setAttrSaving(false); }
  };

  const handleDeleteCustomAttribute = async (attr: CustomAttributeType) => {
    if (!editTarget) return;
    if (!confirm(`Remover o atributo "${attr.label}"? Só é possível se ele não estiver em uso em nenhum preset/efeito da mesa.`)) return;
    try {
      await api.delete(`/campaigns/${editTarget.id}/attributes/${attr.id}`);
      toast.success(`Atributo "${attr.label}" removido`);
      setEditTarget((prev) =>
        prev ? { ...prev, customAttributes: prev.customAttributes.filter((a) => a.id !== attr.id) } : prev
      );
      await refresh();
    } catch {}
  };

  const handleAdvanceDay = async (setDay?: number) => {
    if (!editTarget) return;
    setAdvanceDayLoading(true);
    try {
      const res = await api.post(`/campaigns/${editTarget.id}/advance-day`, setDay != null ? { setDay } : {});
      const newDay = res.data.worldDay as number;
      toast.success(`Dia do mundo avançado para ${newDay}`);
      setEditTarget((prev) => (prev ? { ...prev, worldDay: newDay } : prev));
      setJumpToDay("");
      await refresh();
    } catch {}
    finally { setAdvanceDayLoading(false); }
  };

  const handleEditSave = editForm.handleSubmit(async (values) => {
    if (!editTarget) return;
    try {
      await api.patch(`/campaigns/${editTarget.id}`, {
        ...values,
        defenseFormula: values.defenseFormula ?? null,
        maxLifeFormula: values.maxLifeFormula ?? null,
        reactionsPerRound: editReactionsPerRound === "" ? null : Number(editReactionsPerRound),
        characterImageColor: editImageColor === "" ? null : editImageColor,
        abilitySanityCost: editAbilitySanityCost === "" ? null : Number(editAbilitySanityCost),
      });
      toast.success("Mesa atualizada");
      setEditTarget(null);
      await refresh();
    } catch {}
  });

  const formatExpiration = (iso: string | null) => {
    if (!iso) return "nunca expira";
    const date = new Date(iso);
    return `expira em ${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: "auto", color: "#cdd1e0" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" sx={{ color: "#8B9DFF" }}>Minhas Mesas</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeArchived}
                onChange={(e) => { setIncludeArchived(e.target.checked); reload({ includeArchived: e.target.checked }); }}
              />
            }
            label={<Typography sx={{ fontSize: 12 }}>Arquivadas</Typography>}
          />
          <Button startIcon={<LoginIcon />} variant="outlined" onClick={() => setJoinOpen(true)}>
            Entrar com código
          </Button>
          {user?.isAdmin && (
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
              Nova mesa
            </Button>
          )}
        </Stack>
      </Stack>

      {loading && <Typography>Carregando…</Typography>}
      {!loading && campaigns.length === 0 && (
        <Card sx={{ background: "#16162a", border: "1px solid rgba(107,122,219,0.20)" }}>
          <CardContent>
            <Typography sx={{ color: "#888" }}>
              Você ainda não participa de nenhuma mesa. {user?.role === "MESTRE" ? "Crie uma nova ou" : "Peça um código ao mestre e"} use o botão acima.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Stack spacing={2}>
        {campaigns.map((c) => {
          const isMaster = c.masterId === user?.id;
          const isActive = activeCampaign?.id === c.id;
          const isArchived = !!c.archivedAt;
          return (
            <Card key={c.id} sx={{
              background: "#16162a",
              border: isActive ? "1px solid #8B9DFF" : "1px solid rgba(107,122,219,0.20)",
              opacity: isArchived ? 0.55 : 1,
            }}>
              <CardContent>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
                  <Box flex={1}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Typography variant="h6" sx={{ color: "#cdd1e0" }}>{c.name}</Typography>
                      {isMaster && <Chip label="Mestre" size="small" sx={{ background: "rgba(107,122,219,0.2)", color: "#8B9DFF" }} />}
                      {isActive && <Chip label="Ativa" size="small" color="success" />}
                      {isArchived && <Chip label="Arquivada" size="small" sx={{ background: "rgba(255,255,255,0.08)" }} />}
                    </Stack>
                    {c.description && (
                      <Typography variant="body2" sx={{ color: "#888", mt: 0.5 }}>{c.description}</Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                      Mestre: {c.master.username} · {c.members.length} membro(s)
                      {c._count && ` · ${c._count.characters} personagens · ${c._count.combats} combates`}
                    </Typography>

                    {/* MEMBROS */}
                    <Box mt={1}>
                      {c.members.map((m) => {
                        const isOwn = m.user.id === user?.id;
                        const isMasterChip = m.user.id === c.masterId;
                        return (
                          <Chip
                            key={m.id}
                            label={m.user.username}
                            size="small"
                            onDelete={
                              isMaster && !isMasterChip
                                ? () => handleRemoveMember(c.id, m.user.id, m.user.username)
                                : isOwn && !isMaster
                                  ? () => handleLeave(c.id)
                                  : undefined
                            }
                            deleteIcon={<CloseIcon style={{ fontSize: 14 }} />}
                            sx={{
                              mr: 0.5, mb: 0.5, fontSize: 11,
                              background: isMasterChip ? "rgba(107,122,219,0.18)" : "rgba(255,255,255,0.05)",
                              color: "#cdd1e0",
                            }}
                          />
                        );
                      })}
                    </Box>

                    {/* CONVITES ATIVOS */}
                    {isMaster && c.invites && c.invites.length > 0 && (
                      <Box mt={1.5}>
                        <Typography variant="caption" sx={{ color: "#8B9DFF", fontWeight: 600 }}>
                          Convites ativos:
                        </Typography>
                        <List dense disablePadding>
                          {c.invites.map((inv) => (
                            <ListItem
                              key={inv.id}
                              disablePadding
                              secondaryAction={
                                <Stack direction="row" spacing={0.5}>
                                  <Tooltip title="Copiar link">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        const url = buildInviteUrl(inv.code);
                                        navigator.clipboard?.writeText(url);
                                        toast.success("Link copiado");
                                      }}
                                      sx={{ color: "#8B9DFF" }}
                                    >
                                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Revogar convite">
                                    <IconButton size="small" onClick={() => handleRevokeInvite(c.id, inv.id)} sx={{ color: "#f87171" }}>
                                      <CloseIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              }
                            >
                              <ListItemText
                                primary={
                                  <Box sx={{ fontFamily: "monospace", letterSpacing: 2, fontWeight: 700, color: "#cdd1e0" }}>
                                    {inv.code}
                                  </Box>
                                }
                                secondary={
                                  <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                                    {formatExpiration(inv.expiresAt)}
                                    {inv.maxUses != null && ` · ${inv.uses}/${inv.maxUses} usos`}
                                    {inv.maxUses == null && inv.uses > 0 && ` · ${inv.uses} uso(s)`}
                                  </Typography>
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                      </Box>
                    )}
                  </Box>

                  {/* AÇÕES */}
                  <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
                    {!isArchived && (
                      <Button
                        size="small" variant="contained" startIcon={<PlayArrowIcon />}
                        onClick={() => enterCampaign(c.id)}
                      >
                        Entrar
                      </Button>
                    )}
                    {isMaster && !isArchived && (
                      <Tooltip title="Gerar convite">
                        <IconButton onClick={() => openInviteDialog(c)} size="small" sx={{ color: "#8B9DFF" }}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {isMaster && !isArchived && (
                      <Tooltip title="Editar">
                        <IconButton onClick={() => openEditDialog(c)} size="small" sx={{ color: "#8B9DFF" }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {isMaster && (
                      <Tooltip title={isArchived ? "Restaurar mesa" : "Arquivar mesa"}>
                        <IconButton onClick={() => handleArchiveToggle(c)} size="small" sx={{ color: isArchived ? "#66bb6a" : "#f87171" }}>
                          {isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {!isMaster && (
                      <Tooltip title="Sair da mesa">
                        <IconButton onClick={() => handleLeave(c.id)} size="small" sx={{ color: "#f87171" }}>
                          <LogoutIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      {/* CRIAR MESA */}
      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setSelectedMaster(null);
          setUserQuery("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={handleCreate}>
          <DialogTitle>Nova mesa</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              <Controller
                name="name"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} label="Nome" fullWidth autoFocus
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )}
              />
              <Controller
                name="description"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} value={field.value ?? ""} label="Descrição (opcional)"
                    fullWidth multiline rows={3}
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )}
              />

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>Atribuir mestre</Typography>
              <Autocomplete<AdminUserOption>
                options={userOptions}
                value={selectedMaster}
                onChange={(_, v) => setSelectedMaster(v)}
                onInputChange={(_, v) => setUserQuery(v)}
                loading={usersLoading}
                getOptionLabel={(opt) => opt.username}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                filterOptions={(x) => x}
                renderOption={(props, opt) => (
                  <li {...props} key={opt.id}>
                    <Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ fontWeight: 600 }}>{opt.username}</Typography>
                        <Chip
                          label={opt.role}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: 10,
                            background: opt.role === "MESTRE"
                              ? "rgba(107,122,219,0.2)"
                              : "rgba(255,255,255,0.08)",
                            color: opt.role === "MESTRE" ? "#8B9DFF" : "#cdd1e0",
                          }}
                        />
                      </Stack>
                      <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                        {opt.email}
                      </Typography>
                    </Stack>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Buscar mestre"
                    placeholder="Digite um nome ou e-mail"
                  />
                )}
              />
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                {selectedMaster?.role === "JOGADOR"
                  ? "O usuário será promovido a MESTRE automaticamente."
                  : ""}
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setCreateOpen(false);
              setSelectedMaster(null);
              setUserQuery("");
            }}>Cancelar</Button>
            <Button type="submit" variant="contained">Criar</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* EDITAR MESA */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} fullWidth maxWidth="sm">
        <form onSubmit={handleEditSave}>
          <DialogTitle>Editar mesa</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              <Controller
                name="name"
                control={editForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} label="Nome" fullWidth autoFocus
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )}
              />
              <Controller
                name="description"
                control={editForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} value={field.value ?? ""} label="Descrição"
                    fullWidth multiline rows={3}
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )}
              />

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>
                Fórmulas de atributos derivados
              </Typography>
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                Deixe em branco para usar a fórmula padrão. Variáveis: {FORMULA_VARIABLES.join(", ")}
                {editTarget && editTarget.customAttributes.length > 0
                  ? `, ${editTarget.customAttributes.map((a) => a.key).join(", ")}`
                  : ""}.
                Operadores: + - * / e parênteses.
              </Typography>
              <Controller
                name="defenseFormula"
                control={editForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} value={field.value ?? ""} label="Fórmula de defesa"
                    fullWidth placeholder={DEFAULT_DEFENSE_FORMULA}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message ?? `Padrão: ${DEFAULT_DEFENSE_FORMULA}`} />
                )}
              />
              <Controller
                name="maxLifeFormula"
                control={editForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} value={field.value ?? ""} label="Fórmula de vida máxima"
                    fullWidth placeholder={DEFAULT_MAX_LIFE_FORMULA}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message ?? `Padrão: ${DEFAULT_MAX_LIFE_FORMULA}`} />
                )}
              />

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>
                Atributos customizados
              </Typography>
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                Atributos extras da mesa (ex: Maestria, Sorte), além dos 5 fixos — funcionam em testes,
                presets de ataque/habilidade, buffs/debuffs e nas fórmulas acima. São aplicados a todos os
                personagens da mesa assim que criados.
              </Typography>
              {editTarget && editTarget.customAttributes.length > 0 && (
                <List dense disablePadding>
                  {editTarget.customAttributes.map((attr) => (
                    <ListItem
                      key={attr.id}
                      disableGutters
                      secondaryAction={
                        <IconButton edge="end" size="small" onClick={() => handleDeleteCustomAttribute(attr)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={attr.label}
                        secondary={`key: ${attr.key} · padrão: ${attr.defaultValue}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <TextField
                  size="small"
                  label="Nome do novo atributo"
                  placeholder="Ex: Maestria"
                  value={newAttrLabel}
                  onChange={(e) => setNewAttrLabel(e.target.value)}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Valor padrão"
                  type="number"
                  value={newAttrDefault}
                  onChange={(e) => setNewAttrDefault(e.target.value)}
                  sx={{ maxWidth: 140 }}
                />
                <Button
                  type="button"
                  variant="outlined"
                  disabled={!newAttrLabel.trim() || attrSaving}
                  onClick={handleAddCustomAttribute}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Adicionar
                </Button>
              </Stack>

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>
                Reações em combate
              </Typography>
              <TextField
                select
                label="Reações por rodada"
                value={editReactionsPerRound}
                onChange={(e) => setEditReactionsPerRound(e.target.value)}
                fullWidth
                helperText="Quantas reações (esquiva/bloqueio/contra-ataque) cada personagem pode usar por rodada"
              >
                <MenuItem value="">Ilimitadas (reage a todos os ataques)</MenuItem>
                {[1, 2, 3, 4, 5].map((n) => (
                  <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                ))}
              </TextField>
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                Exceções individuais (ex: habilidade com reação extra ou segundo ataque) são configuradas na ficha de cada personagem.
              </Typography>

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>
                Dia do mundo
              </Typography>
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                Habilidades com limite de usos por dia (configurado na ficha) liberam de novo quando você avança o dia. Dia atual: <strong>{editTarget?.worldDay ?? 1}</strong>.
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  disabled={advanceDayLoading}
                  onClick={() => handleAdvanceDay()}
                >
                  Avançar 1 dia
                </Button>
                <TextField
                  size="small"
                  label="Ir para o dia"
                  type="number"
                  value={jumpToDay}
                  onChange={(e) => setJumpToDay(e.target.value)}
                  sx={{ maxWidth: 140 }}
                  inputProps={{ min: 1 }}
                />
                <Button
                  type="button"
                  size="small"
                  disabled={advanceDayLoading || !jumpToDay}
                  onClick={() => handleAdvanceDay(Number(jumpToDay))}
                >
                  Ir
                </Button>
              </Stack>

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>
                Sanidade
              </Typography>
              <Typography variant="caption" sx={{ color: "#7a7f95" }}>
                Custo automático de sanidade toda vez que um personagem usa qualquer habilidade — soma com qualquer efeito de sanidade específico configurado na própria habilidade. Vale só pra personagens com sanidade rastreada (configurada na ficha, aba mestre).
              </Typography>
              <TextField
                size="small"
                label="Sanidade gasta por uso de habilidade"
                type="number"
                value={editAbilitySanityCost}
                onChange={(e) => setEditAbilitySanityCost(e.target.value)}
                sx={{ maxWidth: 260 }}
                inputProps={{ min: 0 }}
                helperText="Vazio = nenhum custo automático"
              />

              <Divider sx={{ borderColor: "rgba(107,122,219,0.20)" }} />
              <Typography variant="subtitle2" sx={{ color: "#8B9DFF" }}>
                Aparência
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField
                  type="color"
                  label="Cor de destaque da imagem do personagem"
                  value={editImageColor || "#FF3D00"}
                  onChange={(e) => setEditImageColor(e.target.value)}
                  fullWidth
                  helperText={editImageColor ? `Cor personalizada: ${editImageColor}` : "Usando a cor padrão do sistema (laranja)"}
                />
                <Button size="small" disabled={!editImageColor} onClick={() => setEditImageColor("")}>
                  Padrão
                </Button>
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button type="submit" variant="contained">Salvar</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ENTRAR COM CÓDIGO */}
      <Dialog open={joinOpen} onClose={() => setJoinOpen(false)} fullWidth maxWidth="xs">
        <form onSubmit={handleJoin}>
          <DialogTitle>Entrar com código</DialogTitle>
          <DialogContent>
            <Controller
              name="code"
              control={joinForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  label="Código"
                  fullWidth
                  autoFocus
                  inputProps={{ maxLength: 6 }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  sx={{ mt: 1, "& input": { letterSpacing: 3, textAlign: "center", fontWeight: 700 } }}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setJoinOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">Entrar</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* GERAR CONVITE */}
      <Dialog open={!!inviteTarget} onClose={() => setInviteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Gerar convite</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              select
              label="Validade"
              value={inviteExpHours}
              onChange={(e) => setInviteExpHours(Number(e.target.value))}
              fullWidth
            >
              {EXPIRATION_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Máximo de usos (opcional)"
              type="number"
              value={inviteMaxUses}
              onChange={(e) => setInviteMaxUses(e.target.value)}
              inputProps={{ min: 1 }}
              fullWidth
              placeholder="ilimitado"
            />
            <Divider />
            <Typography variant="caption" sx={{ color: "#7a7f95" }}>
              O código será copiado para o clipboard ao gerar.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => { handleGenerateInvite(); setInviteTarget(null); }}>Gerar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
