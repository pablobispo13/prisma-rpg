/**
 * Suíte de integração COMPLETA do sistema (jul/2026), com foco nas
 * habilidades multi-efeito:
 *
 *  S1 — Autenticação (registro, login, /auth/me)
 *  S2 — Mesas (criação, convite por código, entrada, listagem)
 *  S3 — Personagens e inventário
 *  S4 — Presets multi-efeito (CRUD, linhas de efeito, validação de seleção)
 *  S5 — Combate base (iniciativa, turnos, ataque, dano)
 *  S6 — Habilidade composta ALL (dano + 2 efeitos numa ação) e DOT na virada
 *  S7 — Habilidade CHOOSE_ONE ("cenários"): quebrar armadura OU marcar (+1d6)
 *  S8 — Controle mental (teste resistido, reteste com decaimento, expiração)
 *  S9 — Reações (esquiva) seguem funcionando na resolução clássica
 *  S10 — Efeito SELF, fallback legado de efeito único e rolagem manual
 *  S12 — Usos por dia (ActionPreset.usesPerDay) e avanço do worldDay
 *  S13 — Sanidade controlada pelo mestre (oculta do jogador, SANITY_DRAIN)
 *  S11 — Consultas (rolls, logs, combate ativo) e fim de combate (limpeza)
 *
 * Pré-requisito: servidor rodando (npm run dev) e DATABASE_URL no .env.
 * Uso: npx tsx scripts/test-sistema-completo.ts
 * Cria dados prefixados com TESTE_SYS e remove tudo ao final.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PREFIX = "TESTE_SYS";
const EMAIL_PREFIX = "teste-sys-";
const PASSWORD = "senha-teste-123";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  OK   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

type ApiResult = { status: number; data: any };

async function api(
  method: string,
  path: string,
  opts: { token?: string; campaignId?: string; body?: unknown } = {}
): Promise<ApiResult> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.campaignId ? { "x-campaign-id": opts.campaignId } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respostas sem corpo (204 etc.) */
  }
  return { status: res.status, data };
}

async function registerAndLogin(username: string, email: string): Promise<{ id: string; token: string }> {
  await api("POST", "/auth/register", { body: { username, email, password: PASSWORD } });
  const login = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`Login falhou para ${email}: ${JSON.stringify(login.data)}`);
  return { id: login.data.user.id, token: login.data.token };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  const campaigns = await prisma.campaign.findMany({
    where: { OR: [{ masterId: { in: userIds } }, { name: { startsWith: PREFIX } }] },
    select: { id: true },
  });
  const campaignIds = campaigns.map((c) => c.id);

  const chars = await prisma.character.findMany({
    where: { OR: [{ campaignId: { in: campaignIds } }, { ownerId: { in: userIds } }] },
    select: { id: true },
  });
  const charIds = chars.map((c) => c.id);

  const rolls = await prisma.rollResult.findMany({
    where: { characterId: { in: charIds } },
    select: { id: true },
  });
  const rollIds = rolls.map((r) => r.id);

  await prisma.rollResultDetail.deleteMany({
    where: { OR: [{ rollResultId: { in: rollIds } }, { targetId: { in: charIds } }] },
  });
  await prisma.actionLog.deleteMany({
    where: {
      OR: [
        { combatId: { in: (await prisma.combat.findMany({ where: { campaignId: { in: campaignIds } }, select: { id: true } })).map((c) => c.id) } },
        { characterId: { in: charIds } },
        { targetId: { in: charIds } },
      ],
    },
  });
  await prisma.characterEffect.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.presetDailyUsage.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.presetEffect.deleteMany({ where: { preset: { characterId: { in: charIds } } } });
  await prisma.rollResult.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.combatTurn.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.combatParticipant.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.inventory.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.character.updateMany({
    where: { id: { in: charIds } },
    data: { dodgePresetId: null, blockPresetId: null, counterAttackPresetId: null },
  });
  await prisma.actionPreset.deleteMany({ where: { characterId: { in: charIds } } });
  await prisma.combat.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.character.deleteMany({ where: { id: { in: charIds } } });
  await prisma.campaignInvite.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaignMember.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  try {
    await fetch(`${BASE}/api/health`);
  } catch {
    console.error(`Servidor não respondeu em ${BASE} — rode "npm run dev" antes.`);
    process.exit(1);
  }

  console.log("Limpando resíduos de execuções anteriores…");
  await cleanup();

  const stamp = Date.now();

  /* ============ S1 — AUTENTICAÇÃO ============ */
  console.log("\n== S1: Autenticação ==");
  const mestre = await registerAndLogin(`${PREFIX}_mestre`, `${EMAIL_PREFIX}mestre-${stamp}@teste.com`);
  const jogador = await registerAndLogin(`${PREFIX}_jogador`, `${EMAIL_PREFIX}jogador-${stamp}@teste.com`);
  check("registro + login funcionam", !!mestre.token && !!jogador.token);

  let r = await api("POST", "/auth/login", { body: { email: `${EMAIL_PREFIX}mestre-${stamp}@teste.com`, password: "errada" } });
  check("login com senha errada rejeitado", r.status === 401 || r.status === 400, r.status);

  r = await api("GET", "/auth/me", { token: jogador.token });
  check("/auth/me retorna o usuário", r.status === 200, r.status);

  // Mestre precisa de papel MESTRE + admin para criar mesas
  await prisma.user.update({ where: { id: mestre.id }, data: { role: "MESTRE", isAdmin: true } });
  const relogin = await api("POST", "/auth/login", { body: { email: `${EMAIL_PREFIX}mestre-${stamp}@teste.com`, password: PASSWORD } });
  mestre.token = relogin.data.token;

  /* ============ S2 — MESAS ============ */
  console.log("\n== S2: Mesas (criação, convite, entrada) ==");
  r = await api("POST", "/campaigns", { token: mestre.token, body: { name: `${PREFIX} Mesa`, masterId: mestre.id } });
  const cid = r.data?.id;
  check("mestre cria mesa (201)", r.status === 201 && !!cid, { status: r.status });

  r = await api("POST", `/campaigns/${cid}/invite`, { token: mestre.token, body: {} });
  const inviteCode = r.data?.code;
  check("mestre gera convite (201)", r.status === 201 && !!inviteCode, r.status);

  r = await api("POST", "/campaigns/join", { token: jogador.token, body: { code: inviteCode } });
  check("jogador entra pela primeira vez com o código", r.status === 200 || r.status === 201, { status: r.status, data: r.data });

  r = await api("GET", "/campaigns", { token: jogador.token });
  const joined = (r.data?.campaigns ?? r.data ?? []).some?.((c: any) => c.id === cid);
  check("mesa aparece na listagem do jogador", r.status === 200 && joined === true, r.data);

  /* ============ S3 — PERSONAGENS E INVENTÁRIO ============ */
  console.log("\n== S3: Personagens e inventário ==");
  const baseChar = { life: 100, maxLife: 100, baseDefense: 0, strength: 0, agility: 0, vigor: 0, intellect: 0, presence: 0 };

  const controladorRes = await api("POST", "/characters", {
    token: jogador.token, campaignId: cid,
    body: { ...baseChar, name: `${PREFIX} Controlador`, presence: 30 },
  });
  const controlador = controladorRes.data;

  // Suporte pertence ao mestre: jogador comum só pode ter 1 personagem por mesa
  const suporteRes = await api("POST", "/characters", {
    token: mestre.token, campaignId: cid,
    body: { ...baseChar, name: `${PREFIX} Suporte` },
  });
  const suporte = suporteRes.data;

  const vitimaRes = await api("POST", "/characters", {
    token: mestre.token, campaignId: cid,
    body: { ...baseChar, name: `${PREFIX} Vitima` },
  });
  const vitima = vitimaRes.data;

  const vitima2Res = await api("POST", "/characters", {
    token: mestre.token, campaignId: cid,
    body: { ...baseChar, name: `${PREFIX} Vitima Forte`, presence: 30, baseDefense: 10 },
  });
  const vitima2 = vitima2Res.data;

  check("4 personagens criados", [controladorRes, suporteRes, vitimaRes, vitima2Res].every((x) => x.status === 201),
    [controladorRes.status, suporteRes.status, vitimaRes.status, vitima2Res.status]);

  // Sem limite de ataques atrapalhando os cenários (teto do sistema: 20)
  for (const c of [controlador, suporte, vitima, vitima2]) {
    await api("PUT", `/characters/${c.id}`, { token: mestre.token, body: { maxAttacksPerRound: 20 } });
  }
  const controladorDb = await prisma.character.findUnique({ where: { id: controlador.id } });
  check("mestre configurou limite de ataques (20)", controladorDb?.maxAttacksPerRound === 20, controladorDb?.maxAttacksPerRound);

  r = await api("POST", "/inventory", { token: jogador.token, body: { action: "add", characterId: controlador.id, name: `${PREFIX} Poção`, quantity: 2 } });
  check("item adicionado ao inventário", r.status === 200 || r.status === 201, r.status);
  r = await api("POST", "/inventory", { token: jogador.token, body: { action: "list", characterId: controlador.id } });
  check("inventário lista o item", (r.data?.items ?? []).length === 1, r.data?.items?.length);

  /* ============ S4 — PRESETS MULTI-EFEITO ============ */
  console.log("\n== S4: Presets multi-efeito (CRUD e validação) ==");

  // Ataque simples do controlador (dano fixo 5, sem efeito)
  const soco = (await api("POST", "/actionPreset", {
    token: jogador.token,
    body: {
      name: `${PREFIX} Soco`, description: "ataque fixo", type: "ATTACK", targetType: "ENEMY",
      diceFormula: "1d20", impactFormula: "5", attribute: "STRENGTH", appliesEffect: false, characterId: controlador.id,
    },
  })).data;

  // Esquiva do controlador (para o teste de reação)
  const esquiva = (await api("POST", "/actionPreset", {
    token: jogador.token,
    body: {
      name: `${PREFIX} Esquiva`, description: "reação", type: "REACT", targetType: "SELF",
      diceFormula: "1d20", attribute: "AGILITY", appliesEffect: false, characterId: controlador.id,
    },
  })).data;
  await api("PUT", `/characters/${controlador.id}`, { token: jogador.token, body: { dodgePresetId: esquiva.id } });

  // Garra da vítima (para atacar o controlador e abrir reação)
  const garra = (await api("POST", "/actionPreset", {
    token: mestre.token,
    body: {
      name: `${PREFIX} Garra`, description: "ataque npc", type: "ATTACK", targetType: "ENEMY",
      diceFormula: "1d20", impactFormula: "5", attribute: "STRENGTH", appliesEffect: false, characterId: vitima.id,
    },
  })).data;

  // Habilidade de 2 cenários (CHOOSE_ONE): quebrar armadura OU marcar
  r = await api("POST", "/actionPreset", {
    token: mestre.token,
    body: {
      name: `${PREFIX} Tática Dupla`, description: "escolha um modo", type: "SKILL", targetType: "MULTIPLE",
      diceFormula: "1d20", attribute: "INTELLECT", resolution: "AUTO", effectSelectionMode: "CHOOSE_ONE",
      characterId: suporte.id,
      effects: [
        { name: "Quebrar Armadura", description: "-5 de defesa por 2 rodadas", effectType: "DEFENSE_DEBUFF", value: 5, durationTurns: 2 },
        { name: "Marca de Caça", description: "alvo sofre +1d6 de dano de qualquer ataque", effectType: "DAMAGE_TAKEN_BONUS", valueFormula: "1d6", durationTurns: 2 },
      ],
    },
  });
  const tatica = r.data;
  check("preset CHOOSE_ONE criado com 2 efeitos", r.status === 201 && tatica?.effects?.length === 2, { status: r.status, effects: tatica?.effects?.length });

  // Habilidade composta (ALL): dano + veneno + quebra de defesa numa ação
  r = await api("POST", "/actionPreset", {
    token: mestre.token,
    body: {
      name: `${PREFIX} Lâmina Venenosa`, description: "dano + 2 efeitos", type: "ATTACK", targetType: "ENEMY",
      diceFormula: "1d20", impactFormula: "3", attribute: "STRENGTH", effectSelectionMode: "ALL",
      characterId: suporte.id,
      effects: [
        { name: "Veneno", effectType: "DAMAGE_OVER_TIME", value: 2, durationTurns: 2 },
        { name: "Corrosão", effectType: "DEFENSE_DEBUFF", value: 3, durationTurns: 3 },
      ],
    },
  });
  const lamina = r.data;
  check("preset ALL criado com 2 efeitos", r.status === 201 && lamina?.effects?.length === 2, r.status);

  // Controle mental: teste resistido de presença, reteste decaindo 2/rodada
  r = await api("POST", "/actionPreset", {
    token: jogador.token,
    body: {
      name: `${PREFIX} Dominar Mente`, description: "controle por até 3 rodadas", type: "SKILL", targetType: "ENEMY",
      diceFormula: "1d20", attribute: "PRESENCE", resolution: "CONTESTED", contestAttribute: "PRESENCE",
      characterId: controlador.id,
      effects: [
        { name: "Controle Mental", effectType: "CONTROLLED", durationTurns: 3, retestEachRound: true, contestDecay: 50 },
      ],
    },
  });
  const dominarFacil = r.data; // decay 50: alvo se liberta no 1º reteste
  check("preset CONTESTED criado", r.status === 201 && dominarFacil?.effects?.length === 1, r.status);

  const dominarPersistente = (await api("POST", "/actionPreset", {
    token: jogador.token,
    body: {
      name: `${PREFIX} Dominar Persistente`, description: "controle 19→17→15", type: "SKILL", targetType: "ENEMY",
      diceFormula: "1d20", attribute: "PRESENCE", resolution: "CONTESTED", contestAttribute: "PRESENCE",
      characterId: controlador.id,
      effects: [
        { name: "Controle Persistente", effectType: "CONTROLLED", durationTurns: 3, retestEachRound: true, contestDecay: 2 },
      ],
    },
  })).data;

  // Controle fraco: atributo STRENGTH (0) vs presença 30 do alvo → sempre resiste
  const controleFraco = (await api("POST", "/actionPreset", {
    token: jogador.token,
    body: {
      name: `${PREFIX} Controle Fraco`, description: "sempre falha vs vontade forte", type: "SKILL", targetType: "ENEMY",
      diceFormula: "1d20", attribute: "STRENGTH", resolution: "CONTESTED", contestAttribute: "PRESENCE",
      characterId: controlador.id,
      effects: [
        { name: "Sugestão", effectType: "CONTROLLED", durationTurns: 3, retestEachRound: true, contestDecay: 2 },
      ],
    },
  })).data;

  // Buff SELF (aplica no conjurador)
  const postura = (await api("POST", "/actionPreset", {
    token: mestre.token,
    body: {
      name: `${PREFIX} Postura Defensiva`, description: "+4 defesa em si", type: "BUFF", targetType: "SELF",
      diceFormula: "1d20", attribute: "VIGOR", resolution: "AUTO",
      characterId: suporte.id,
      effects: [
        { name: "Postura", effectType: "DEFENSE_BUFF", value: 4, durationTurns: 2, target: "SELF" },
      ],
    },
  })).data;

  // Preset legado (sem linhas de efeito) — valida o fallback de efeito único
  const gritoLegado = (await api("POST", "/actionPreset", {
    token: mestre.token,
    body: {
      name: `${PREFIX} Grito Legado`, description: "buff legado", type: "BUFF", targetType: "ALLY",
      diceFormula: "1d20", attribute: "PRESENCE", appliesEffect: true,
      effectType: "STAT_BUFF", statAffected: "STRENGTH", effectAmount: 2, durationTurns: 2,
      characterId: suporte.id,
    },
  })).data;

  // GET traz as linhas; PUT substitui as linhas
  r = await api("GET", `/actionPreset/${tatica.id}`, { token: mestre.token });
  check("GET do preset traz as linhas de efeito", r.data?.preset?.effects?.length === 2, r.data?.preset?.effects?.length);

  r = await api("PUT", `/actionPreset/${lamina.id}`, {
    token: mestre.token,
    body: {
      effects: [
        { name: "Veneno", effectType: "DAMAGE_OVER_TIME", value: 2, durationTurns: 2 },
        { name: "Corrosão", effectType: "DEFENSE_DEBUFF", value: 3, durationTurns: 3 },
        { name: "Lentidão", effectType: "STAT_DEBUFF", statAffected: "AGILITY", value: 1, durationTurns: 2 },
      ],
    },
  });
  check("PUT substitui as linhas de efeito (2 → 3)", r.status === 200 && r.data?.effects?.length === 3, r.data?.effects?.length);
  r = await api("PUT", `/actionPreset/${lamina.id}`, {
    token: mestre.token,
    body: {
      effects: [
        { name: "Veneno", effectType: "DAMAGE_OVER_TIME", value: 2, durationTurns: 2 },
        { name: "Corrosão", effectType: "DEFENSE_DEBUFF", value: 3, durationTurns: 3 },
      ],
    },
  });
  check("PUT volta para 2 linhas", r.status === 200 && r.data?.effects?.length === 2, r.data?.effects?.length);

  // Validações de seleção (não precisam de combate)
  r = await api("POST", "/roll", { token: mestre.token, body: { characterId: suporte.id, actionPresetId: tatica.id, targetIds: [vitima.id] } });
  check("CHOOSE_ONE sem escolha → 400 EFFECT_SELECTION_REQUIRED", r.status === 400 && r.data?.code === "EFFECT_SELECTION_REQUIRED", r.data);
  check("resposta 400 lista os efeitos para a modal", (r.data?.effects ?? []).length === 2, r.data?.effects);

  const efeitoArmadura = tatica.effects.find((e: any) => e.name === "Quebrar Armadura");
  const efeitoMarca = tatica.effects.find((e: any) => e.name === "Marca de Caça");

  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: tatica.id, targetIds: [vitima.id], selectedEffectIds: [efeitoArmadura.id, efeitoMarca.id] },
  });
  check("CHOOSE_ONE com 2 escolhas → 400", r.status === 400, r.status);

  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: tatica.id, targetIds: [vitima.id], selectedEffectIds: [soco.id] },
  });
  check("selectedEffectIds de outro preset → 400 EFFECT_SELECTION_INVALID", r.status === 400 && r.data?.code === "EFFECT_SELECTION_INVALID", r.data);

  /* ============ S5 — COMBATE BASE ============ */
  console.log("\n== S5: Combate base ==");
  r = await api("POST", "/combat/control", {
    token: mestre.token, campaignId: cid,
    body: { action: "startCombat", participantIds: [controlador.id, suporte.id, vitima.id, vitima2.id] },
  });
  const combatId = r.data?.combat?.id;
  check("combate iniciado com 4 participantes", r.status === 201 && r.data?.combat?.participants?.length === 4, r.status);
  check("iniciativa rolada para todos", (r.data?.order ?? []).every((o: any) => typeof o.initiative === "number"), r.data?.order);

  let currentTurn: any = null;
  async function nextTurn() {
    const st = await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "startTurn", combatId } });
    currentTurn = st.data;
    return currentTurn;
  }
  async function endCurrentTurn() {
    if (!currentTurn?.id) return;
    await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "endTurn", combatId, turnId: currentTurn.id } });
    currentTurn = null;
  }
  /**
   * Fecha o turno aberto e avança até um turno RECÉM-ABERTO de charId —
   * garante que o tick de efeitos (DOT, retestes) daquele turno rodou.
   */
  async function advanceTo(charId: string) {
    await endCurrentTurn();
    for (let i = 0; i < 20; i++) {
      const t = await nextTurn();
      if (t?.characterId === charId && !t?.skipped) return t;
      if (t?.skipped) { currentTurn = null; continue; }
      await endCurrentTurn();
    }
    throw new Error(`advanceTo: não chegou ao turno de ${charId}`);
  }
  const participantOf = (charId: string) =>
    prisma.combatParticipant.findFirst({ where: { combatId, characterId: charId } });

  await nextTurn();
  check("turno aberto", !!currentTurn?.id, currentTurn);

  // Ataque simples: controlador → vitima (defesa 0, sem reações = dano direto)
  const vitimaLifeAntes = (await participantOf(vitima.id))!.currentLife;
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("ataque executado (201)", r.status === 201, r.data);
  const vitimaLifeDepois = (await participantOf(vitima.id))!.currentLife;
  check("dano fixo de 5 aplicado direto (sem reações)", vitimaLifeAntes - vitimaLifeDepois === 5, { antes: vitimaLifeAntes, depois: vitimaLifeDepois });

  /* ============ S6 — HABILIDADE COMPOSTA (ALL) + DOT ============ */
  console.log("\n== S6: Habilidade composta ALL e DOT na virada ==");
  const lifeAntesLamina = (await participantOf(vitima.id))!.currentLife;
  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: lamina.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("Lâmina Venenosa acertou (201)", r.status === 201, r.data);
  const lifeDepoisLamina = (await participantOf(vitima.id))!.currentLife;
  check("dano de impacto 3 aplicado", lifeAntesLamina - lifeDepoisLamina === 3, { antes: lifeAntesLamina, depois: lifeDepoisLamina });

  let efeitosVitima = await prisma.characterEffect.findMany({ where: { characterId: vitima.id } });
  check("ALL aplicou os 2 efeitos numa ação", efeitosVitima.length === 2 &&
    efeitosVitima.some((e) => e.type === "DAMAGE_OVER_TIME") && efeitosVitima.some((e) => e.type === "DEFENSE_DEBUFF"),
    efeitosVitima.map((e) => e.type));
  check("efeitos guardam quem aplicou (sourceCharacterId)", efeitosVitima.every((e) => e.sourceCharacterId === suporte.id));

  const lifeAntesDot = (await participantOf(vitima.id))!.currentLife;
  await advanceTo(vitima.id);
  const lifeDepoisDot = (await participantOf(vitima.id))!.currentLife;
  check("DOT de 2 ticou no início do turno da vítima", lifeAntesDot - lifeDepoisDot === 2, { antes: lifeAntesDot, depois: lifeDepoisDot });

  /* ============ S7 — CHOOSE_ONE: ARMADURA OU MARCA ============ */
  console.log("\n== S7: CHOOSE_ONE — quebrar armadura OU marcar ==");

  // Cenário A: quebrar armadura da Vitima Forte (defesa 10 → efetiva 5)
  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: tatica.id, targetIds: [vitima2.id], selectedEffectIds: [efeitoArmadura.id], combatId, turnId: currentTurn?.id },
  });
  check("modo Quebrar Armadura aplicado (201)", r.status === 201, r.data);
  const debuffV2 = await prisma.characterEffect.findFirst({ where: { characterId: vitima2.id, type: "DEFENSE_DEBUFF" } });
  check("DEFENSE_DEBUFF de 5 criado no alvo", debuffV2?.value === 5, debuffV2?.value);

  const atkArmaduraRes = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima2.id], combatId, turnId: currentTurn?.id },
  });
  if (atkArmaduraRes.status !== 201) console.log("  DEBUG ataque armadura:", atkArmaduraRes.status, JSON.stringify(atkArmaduraRes.data));
  const atkArmadura = atkArmaduraRes.data?.roll;
  const detalheArmadura = await prisma.rollResultDetail.findFirst({ where: { rollResultId: atkArmadura.id, targetId: vitima2.id } });
  check("defesa efetiva no ataque caiu de 10 para 5", detalheArmadura?.targetDefense === 5, detalheArmadura?.targetDefense);

  // Cenário B: marcar a Vitima → próximo ataque de QUALQUER um ganha +1d6
  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: tatica.id, targetIds: [vitima.id], selectedEffectIds: [efeitoMarca.id], combatId, turnId: currentTurn?.id },
  });
  check("modo Marca de Caça aplicado (201)", r.status === 201, r.data);
  const marca = await prisma.characterEffect.findFirst({ where: { characterId: vitima.id, type: "DAMAGE_TAKEN_BONUS" } });
  check("marca guarda a fórmula 1d6 (rolada por ataque)", marca?.valueFormula === "1d6", marca);

  const lifeAntesMarca = (await participantOf(vitima.id))!.currentLife;
  const atkMarcadoRes = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  if (atkMarcadoRes.status !== 201) console.log("  DEBUG ataque marcado:", atkMarcadoRes.status, JSON.stringify(atkMarcadoRes.data));
  const atkMarcado = atkMarcadoRes.data?.roll;
  const detalheMarca = await prisma.rollResultDetail.findFirst({ where: { rollResultId: atkMarcado.id, targetId: vitima.id } });
  const danoMarcado = detalheMarca?.damageApplied ?? 0;
  check("dano com marca = 5 base + 1d6 (entre 6 e 11)", danoMarcado >= 6 && danoMarcado <= 11, danoMarcado);
  const lifeDepoisMarca = (await participantOf(vitima.id))!.currentLife;
  check("vida do alvo caiu exatamente o dano marcado", lifeAntesMarca - lifeDepoisMarca === danoMarcado, { antes: lifeAntesMarca, depois: lifeDepoisMarca, dano: danoMarcado });
  const logMarca = await prisma.actionLog.findFirst({ where: { combatId, message: { contains: "está marcado" } } });
  check("log do bônus de marca registrado", !!logMarca, logMarca?.message);

  /* ============ S8 — CONTROLE MENTAL (TESTE RESISTIDO) ============ */
  console.log("\n== S8: Controle mental — resistido, reteste e decaimento ==");

  // Presença 30 vs 0: sempre controla
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: dominarFacil.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("controle lançado (201)", r.status === 201, r.data);
  let controle = await prisma.characterEffect.findFirst({ where: { characterId: vitima.id, type: "CONTROLLED" } });
  check("efeito CONTROLLED criado com estado do teste", !!controle && controle.retestEachRound === true &&
    (controle.contestValue ?? 0) >= 31 && controle.contestAttribute === "PRESENCE" && controle.sourceCharacterId === controlador.id,
    controle);
  const logResistido = await prisma.actionLog.findFirst({ where: { combatId, message: { contains: "falhou no teste resistido" } } });
  check("log do teste resistido registrado", !!logResistido, logResistido?.message);

  // Decay 50: no turno da vítima o valor a bater vai a ≤0 → ela se liberta
  await advanceTo(vitima.id);
  controle = await prisma.characterEffect.findFirst({ where: { characterId: vitima.id, type: "CONTROLLED" } });
  check("com decaimento alto, alvo se libertou no 1º reteste", controle === null, controle);
  const logLiberto = await prisma.actionLog.findFirst({ where: { combatId, message: { contains: "se libertou" } } });
  check("log de libertação registrado", !!logLiberto, logLiberto?.message);

  // Persistente (decay 2): falha nos retestes, contestValue decai 2 por rodada
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: dominarPersistente.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  controle = await prisma.characterEffect.findFirst({ where: { characterId: vitima.id, type: "CONTROLLED" } });
  const valorInicial = controle!.contestValue!;
  check("controle persistente aplicado", r.status === 201 && valorInicial >= 31, valorInicial);

  await advanceTo(vitima.id);
  controle = await prisma.characterEffect.findFirst({ where: { characterId: vitima.id, type: "CONTROLLED" } });
  check("reteste falhou e valor decaiu 2 (ex: 19 → 17)", controle?.contestValue === valorInicial - 2,
    { inicial: valorInicial, atual: controle?.contestValue });
  const logControlado = await prisma.actionLog.findFirst({ where: { combatId, message: { contains: "está sob controle" } } });
  check("log 'sob controle do controlador' no turno do alvo", !!logControlado, logControlado?.message);

  // Duração máxima: após 3 turnos do alvo o efeito expira mesmo sem vencer o teste
  await advanceTo(vitima.id);
  await advanceTo(vitima.id);
  controle = await prisma.characterEffect.findFirst({ where: { characterId: vitima.id, type: "CONTROLLED" } });
  check("controle expira após 3 rodadas (duração máxima)", controle === null, controle);

  // Alvo com presença 30 vs força 0: sempre resiste
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: controleFraco.id, targetIds: [vitima2.id], combatId, turnId: currentTurn?.id },
  });
  const controleV2 = await prisma.characterEffect.findFirst({ where: { characterId: vitima2.id, type: "CONTROLLED" } });
  check("alvo forte resistiu: nenhum efeito criado", r.status === 201 && controleV2 === null, controleV2);
  const logResistiu = await prisma.actionLog.findFirst({ where: { combatId, message: { contains: "resistiu a" } } });
  check("log de resistência registrado", !!logResistiu, logResistiu?.message);

  /* ============ S9 — REAÇÕES SEGUEM FUNCIONANDO ============ */
  console.log("\n== S9: Reações na resolução clássica ==");
  const atkReacao = (await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: vitima.id, actionPresetId: garra.id, targetIds: [controlador.id], combatId, turnId: currentTurn?.id },
  })).data?.roll;
  const atkReacaoDb = await prisma.rollResult.findUnique({ where: { id: atkReacao.id } });
  check("ataque em alvo com esquiva abre reação pendente", atkReacaoDb?.pendingReaction === true, atkReacaoDb?.pendingReaction);
  r = await api("POST", "/combat/react", {
    token: jogador.token,
    body: { rollId: atkReacao.id, reactionType: "DODGE", targetId: controlador.id, turnId: currentTurn?.id },
  });
  check("reação DODGE resolvida (200)", r.status === 200, r.data);

  /* ============ S10 — SELF, LEGADO E ROLAGEM MANUAL ============ */
  console.log("\n== S10: Efeito SELF, fallback legado e rolagem manual ==");
  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: postura.id, combatId, turnId: currentTurn?.id },
  });
  const buffsSuporte = await prisma.characterEffect.findMany({ where: { characterId: suporte.id, type: "DEFENSE_BUFF" } });
  check("efeito SELF aplicado uma única vez no conjurador", r.status === 201 && buffsSuporte.length === 1, buffsSuporte.length);

  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: gritoLegado.id, targetIds: [controlador.id], combatId, turnId: currentTurn?.id },
  });
  const buffLegado = await prisma.characterEffect.findFirst({ where: { characterId: controlador.id, type: "STAT_BUFF" } });
  check("preset legado (sem linhas) ainda aplica efeito único", r.status === 201 && buffLegado?.statAffected === "STRENGTH" && buffLegado?.value === 2, buffLegado);

  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, diceFormula: "2d6+1", combatId, turnId: currentTurn?.id },
  });
  check("rolagem manual 2d6+1 (201, total 3–13)", r.status === 201 && r.data?.roll?.total >= 3 && r.data?.roll?.total <= 13, r.data?.roll?.total);

  /* ============ S12 — USOS POR DIA ============ */
  console.log("\n== S12: Limite de usos por dia (worldDay) ==");

  r = await api("PUT", `/actionPreset/${soco.id}`, { token: jogador.token, body: { usesPerDay: 2 } });
  check("usesPerDay=2 configurado no preset", r.status === 200 && r.data?.usesPerDay === 2, r.data?.usesPerDay);

  // soco já foi usado antes (S5/S7) mas sem tracking diário ativo — contagem começa em 0 agora
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("1º uso do dia permitido (201)", r.status === 201, r.data);

  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("2º uso do dia permitido (201)", r.status === 201, r.data);

  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("3º uso do dia bloqueado (400 DAILY_LIMIT_REACHED)", r.status === 400 && r.data?.code === "DAILY_LIMIT_REACHED", r.data);
  check("resposta 400 informa usesPerDay/usedToday/worldDay", r.data?.usesPerDay === 2 && r.data?.usedToday === 2 && r.data?.worldDay === 1, r.data);

  const usageDay1 = await prisma.presetDailyUsage.findFirst({ where: { characterId: controlador.id, presetId: soco.id, worldDay: 1 } });
  check("PresetDailyUsage registrou 2 usos no dia 1", usageDay1?.usedCount === 2, usageDay1);

  r = await api("POST", `/campaigns/${cid}/advance-day`, { token: jogador.token, body: {} });
  check("jogador não pode avançar o dia (403)", r.status === 403, r.status);

  r = await api("POST", `/campaigns/${cid}/advance-day`, { token: mestre.token, body: {} });
  check("mestre avança o dia (200, worldDay=2)", r.status === 200 && r.data?.worldDay === 2, r.data);

  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("uso liberado no novo dia (201)", r.status === 201, r.data);

  const usageDay2 = await prisma.presetDailyUsage.findFirst({ where: { characterId: controlador.id, presetId: soco.id, worldDay: 2 } });
  check("PresetDailyUsage do dia 2 é uma linha nova (usedCount=1)", usageDay2?.usedCount === 1, usageDay2);
  check("linha do dia 1 preservada como histórico (usedCount=2)",
    (await prisma.presetDailyUsage.findUnique({ where: { id: usageDay1!.id } }))?.usedCount === 2);

  r = await api("POST", `/campaigns/${cid}/advance-day`, { token: mestre.token, body: { setDay: 10 } });
  check("mestre define o dia diretamente (setDay=10)", r.status === 200 && r.data?.worldDay === 10, r.data);

  /* ============ S13 — SANIDADE (CONTROLADA PELO MESTRE) ============ */
  console.log("\n== S13: Sanidade controlada pelo mestre ==");

  r = await api("PUT", `/characters/${controlador.id}`, { token: mestre.token, body: { sanity: 50, maxSanity: 100 } });
  check("mestre define sanidade inicial (50/100)", r.status === 200 && r.data?.sanity === 50 && r.data?.maxSanity === 100, r.data);

  r = await api("GET", `/characters/${controlador.id}`, { token: jogador.token });
  check("jogador NÃO vê sanity/maxSanity na própria ficha", r.status === 200 && !("sanity" in r.data) && !("maxSanity" in r.data),
    { hasSanity: "sanity" in (r.data ?? {}), hasMaxSanity: "maxSanity" in (r.data ?? {}) });

  r = await api("GET", `/characters/${controlador.id}`, { token: mestre.token });
  check("mestre VÊ sanity/maxSanity", r.status === 200 && r.data?.sanity === 50 && r.data?.maxSanity === 100, r.data);

  r = await api("PUT", `/characters/${controlador.id}`, { token: jogador.token, body: { sanity: 999 } });
  const sanityAfterPlayerAttempt = await prisma.character.findUnique({ where: { id: controlador.id }, select: { sanity: true } });
  check("jogador não consegue alterar a própria sanidade (ignorado silenciosamente)",
    r.status === 200 && sanityAfterPlayerAttempt?.sanity === 50, sanityAfterPlayerAttempt);

  r = await api("GET", "/characters", { token: jogador.token, campaignId: cid });
  const controladorNaListaJogador = (r.data?.characters ?? []).find((c: any) => c.id === controlador.id);
  check("listagem para jogador também oculta sanidade", !("sanity" in (controladorNaListaJogador ?? {})), controladorNaListaJogador);

  r = await api("GET", "/characters", { token: mestre.token, campaignId: cid });
  const controladorNaListaMestre = (r.data?.characters ?? []).find((c: any) => c.id === controlador.id);
  check("listagem para mestre mostra sanidade", controladorNaListaMestre?.sanity === 50, controladorNaListaMestre?.sanity);

  // Habilidade que custa sanidade para o próprio conjurador (SANITY_DRAIN, SELF)
  const ritualSombrio = (await api("POST", "/actionPreset", {
    token: jogador.token,
    body: {
      name: `${PREFIX} Ritual Sombrio`, description: "custa sanidade", type: "SKILL", targetType: "SELF",
      diceFormula: "1d20", attribute: "PRESENCE", resolution: "AUTO",
      characterId: controlador.id,
      effects: [{ name: "Custo Mental", effectType: "SANITY_DRAIN", value: 5, target: "SELF" }],
    },
  })).data;

  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: ritualSombrio.id, combatId, turnId: currentTurn?.id },
  });
  check("ritual executado (201)", r.status === 201, r.data);
  let controladorSanityDb = await prisma.character.findUnique({ where: { id: controlador.id } });
  check("SANITY_DRAIN descontou 5 (50 → 45)", controladorSanityDb?.sanity === 45, controladorSanityDb?.sanity);

  const logSanidade = await prisma.actionLog.findFirst({ where: { characterId: controlador.id, message: { contains: "perdeu 5 de sanidade" } } });
  check("log do desconto criado e marcado masterOnly", logSanidade?.masterOnly === true, logSanidade);

  r = await api("GET", `/actionLogs?characterId=${controlador.id}`, { token: jogador.token, campaignId: cid });
  const logsJogador = r.data?.actionLogs ?? r.data?.logs ?? [];
  check("log de sanidade NÃO aparece para o jogador", !logsJogador.some((l: any) => l.id === logSanidade?.id), logsJogador.length);

  r = await api("GET", `/actionLogs?characterId=${controlador.id}`, { token: mestre.token, campaignId: cid });
  const logsMestre = r.data?.actionLogs ?? r.data?.logs ?? [];
  check("log de sanidade aparece para o mestre", logsMestre.some((l: any) => l.id === logSanidade?.id), logsMestre.length);

  // Clamp em 0: sanidade não fica negativa
  await api("PUT", `/characters/${controlador.id}`, { token: mestre.token, body: { sanity: 3 } });
  await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: ritualSombrio.id, combatId, turnId: currentTurn?.id },
  });
  controladorSanityDb = await prisma.character.findUnique({ where: { id: controlador.id } });
  check("sanidade não fica negativa (clamp em 0)", controladorSanityDb?.sanity === 0, controladorSanityDb?.sanity);

  // Personagem sem sanidade rastreada (null): SANITY_DRAIN não faz nada nele
  const vitimaDbAntes = await prisma.character.findUnique({ where: { id: vitima.id }, select: { sanity: true } });
  check("vitima começa sem sanidade rastreada (null)", vitimaDbAntes?.sanity == null, vitimaDbAntes);

  const medoAlheio = (await api("POST", "/actionPreset", {
    token: mestre.token,
    body: {
      name: `${PREFIX} Olhar Medonho`, description: "drena sanidade do alvo", type: "SKILL", targetType: "ENEMY",
      diceFormula: "1d20", attribute: "PRESENCE", resolution: "AUTO",
      characterId: controlador.id,
      effects: [{ name: "Terror", effectType: "SANITY_DRAIN", value: 10, target: "TARGETS" }],
    },
  })).data;
  await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: medoAlheio.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  const vitimaDbDepois = await prisma.character.findUnique({ where: { id: vitima.id }, select: { sanity: true } });
  check("alvo sem sanidade rastreada permanece null (no-op)", vitimaDbDepois?.sanity == null, vitimaDbDepois);

  await api("PUT", `/characters/${vitima.id}`, { token: mestre.token, body: { sanity: 20, maxSanity: 20 } });
  await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: medoAlheio.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  const vitimaDbFinal = await prisma.character.findUnique({ where: { id: vitima.id }, select: { sanity: true } });
  check("com sanidade rastreada, SANITY_DRAIN em TARGETS desconta o alvo (20 → 10)", vitimaDbFinal?.sanity === 10, vitimaDbFinal);

  // Ajuste manual do mestre via combat/control (fora do fluxo de habilidades)
  r = await api("POST", "/combat/control", {
    token: jogador.token, campaignId: cid,
    body: { action: "adjustSanity", combatId, characterId: controlador.id, newSanity: 80 },
  });
  check("jogador não pode usar adjustSanity (403)", r.status === 403, r.status);

  r = await api("POST", "/combat/control", {
    token: mestre.token, campaignId: cid,
    body: { action: "adjustSanity", combatId, characterId: controlador.id, newSanity: 80 },
  });
  check("mestre ajusta sanidade manualmente via combat/control (200)", r.status === 200 && r.data?.sanity === 80, r.data);
  controladorSanityDb = await prisma.character.findUnique({ where: { id: controlador.id } });
  check("ajuste persistido no personagem", controladorSanityDb?.sanity === 80, controladorSanityDb?.sanity);

  r = await api("POST", "/combat/control", {
    token: mestre.token, campaignId: cid,
    body: { action: "adjustSanity", combatId, characterId: controlador.id, newSanity: 999 },
  });
  check("adjustSanity respeita o teto de maxSanity (clamp em 100)", r.status === 200 && r.data?.sanity === 100, r.data);

  // GET /combat/[id] (tela de combate): sanidade some para o jogador, aparece pro mestre
  r = await api("GET", `/combat/${combatId}`, { token: jogador.token, campaignId: cid });
  const participantesJogador = r.data?.participants ?? [];
  check("tela de combate oculta sanidade dos participantes para o jogador",
    participantesJogador.every((p: any) => !("sanity" in (p.character ?? {}))), participantesJogador.map((p: any) => p.character?.sanity));

  r = await api("GET", `/combat/${combatId}`, { token: mestre.token, campaignId: cid });
  const participantesMestre = r.data?.participants ?? [];
  const controladorNoCombateMestre = participantesMestre.find((p: any) => p.character?.id === controlador.id);
  check("tela de combate mostra sanidade para o mestre", controladorNoCombateMestre?.character?.sanity === 100, controladorNoCombateMestre?.character?.sanity);

  /* ============ S14 — CUSTO DE SANIDADE AUTOMÁTICO (TODAS AS HABILIDADES) ============ */
  console.log("\n== S14: Custo de sanidade automático (config do mestre) ==");

  r = await api("PATCH", `/campaigns/${cid}`, { token: jogador.token, body: { abilitySanityCost: 3 } });
  check("jogador não pode configurar custo de sanidade da mesa (403)", r.status === 403, r.status);

  r = await api("PATCH", `/campaigns/${cid}`, { token: mestre.token, body: { abilitySanityCost: 3 } });
  check("mestre configura custo de sanidade da mesa (3)", r.status === 200 && r.data?.abilitySanityCost === 3, r.data?.abilitySanityCost);

  // soco não tem nenhum PresetEffect SANITY_DRAIN — o custo vem só da config da mesa
  let sanityAntes = (await prisma.character.findUnique({ where: { id: controlador.id }, select: { sanity: true } }))!.sanity!;
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("uso de habilidade sem efeito de sanidade explícito (201)", r.status === 201, r.data);
  let sanityDepois = (await prisma.character.findUnique({ where: { id: controlador.id }, select: { sanity: true } }))!.sanity!;
  check("custo automático da mesa (3) descontado mesmo sem efeito configurado na habilidade",
    sanityAntes - sanityDepois === 3, { antes: sanityAntes, depois: sanityDepois });

  const logCustoMesa = await prisma.actionLog.findFirst({ where: { characterId: controlador.id, message: { contains: "gastou 3 de sanidade ao usar" } } });
  check("log do custo automático é masterOnly", logCustoMesa?.masterOnly === true, logCustoMesa);

  // Override por personagem substitui (não soma) o valor da mesa
  r = await api("PUT", `/characters/${controlador.id}`, { token: jogador.token, body: { abilitySanityCostOverride: 10 } });
  const overrideAposJogador = await prisma.character.findUnique({ where: { id: controlador.id }, select: { abilitySanityCostOverride: true } });
  check("jogador não consegue definir o próprio override de custo (ignorado)", overrideAposJogador?.abilitySanityCostOverride == null, overrideAposJogador);

  r = await api("PUT", `/characters/${controlador.id}`, { token: mestre.token, body: { abilitySanityCostOverride: 10 } });
  check("mestre define override de custo (10) no personagem", r.status === 200, r.data);

  sanityAntes = sanityDepois;
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: soco.id, targetIds: [vitima.id], combatId, turnId: currentTurn?.id },
  });
  check("2º uso do dia de soco ainda permitido (201)", r.status === 201, r.data);
  sanityDepois = (await prisma.character.findUnique({ where: { id: controlador.id }, select: { sanity: true } }))!.sanity!;
  check("override do personagem (10) prevalece sobre o valor da mesa (3)",
    sanityAntes - sanityDepois === 10, { antes: sanityAntes, depois: sanityDepois });

  // Empilha com um PresetEffect SANITY_DRAIN explícito da própria habilidade (ritualSombrio: -5)
  // valida que o custo automático relê o valor já descontado pelo efeito, dentro da MESMA transação
  sanityAntes = sanityDepois;
  r = await api("POST", "/roll", {
    token: jogador.token,
    body: { characterId: controlador.id, actionPresetId: ritualSombrio.id, combatId, turnId: currentTurn?.id },
  });
  check("habilidade com efeito de sanidade próprio + custo automático (201)", r.status === 201, r.data);
  sanityDepois = (await prisma.character.findUnique({ where: { id: controlador.id }, select: { sanity: true } }))!.sanity!;
  check("desconto empilha: 5 do efeito da habilidade + 10 do override automático = 15",
    sanityAntes - sanityDepois === 15, { antes: sanityAntes, depois: sanityDepois });

  // Conjurador sem sanidade rastreada: custo automático da mesa não faz nada (sem erro).
  // suporte nunca teve sanity setado (diferente de vitima, mexida na S13).
  const suporteSanidadeAntes = await prisma.character.findUnique({ where: { id: suporte.id }, select: { sanity: true } });
  check("suporte nunca teve sanidade rastreada (null)", suporteSanidadeAntes?.sanity == null, suporteSanidadeAntes);
  r = await api("POST", "/roll", {
    token: mestre.token,
    body: { characterId: suporte.id, actionPresetId: lamina.id, targetIds: [vitima2.id], combatId, turnId: currentTurn?.id },
  });
  check("ataque de conjurador sem sanidade rastreada não quebra (201)", r.status === 201, r.data);
  const suporteSemSanidadeDb = await prisma.character.findUnique({ where: { id: suporte.id }, select: { sanity: true } });
  check("conjurador sem sanidade rastreada permanece null (custo automático é no-op)", suporteSemSanidadeDb?.sanity == null, suporteSemSanidadeDb);

  /* ============ S11 — CONSULTAS E FIM DE COMBATE ============ */
  console.log("\n== S11: Consultas e fim de combate ==");
  r = await api("GET", `/roll?combatId=${combatId}&limit=50`, { token: jogador.token, campaignId: cid });
  check("GET /roll lista as rolagens do combate", r.status === 200 && (r.data?.rolls ?? []).length > 0, r.data?.rolls?.length);

  r = await api("GET", "/combat/active", { token: jogador.token, campaignId: cid });
  check("GET /combat/active traz o combate", r.status === 200 && (r.data ?? []).some?.((c: any) => c.id === combatId), r.status);

  r = await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "endCombat", combatId } });
  check("combate encerrado com estatísticas", r.status === 200 && !!r.data?.stats, r.status);

  const efeitosRestantes = await prisma.characterEffect.count({
    where: { characterId: { in: [controlador.id, suporte.id, vitima.id, vitima2.id] } },
  });
  check("todos os efeitos limpos no fim do combate", efeitosRestantes === 0, efeitosRestantes);

  const vitimaDb = await prisma.character.findUnique({ where: { id: vitima.id } });
  const vitimaParticipant = await participantOf(vitima.id);
  check("HP sincronizado de volta para a ficha", vitimaDb?.life === vitimaParticipant?.currentLife,
    { ficha: vitimaDb?.life, combate: vitimaParticipant?.currentLife });

  r = await api("GET", "/combat/history", { token: mestre.token, campaignId: cid });
  const historico = r.data?.combats ?? r.data ?? [];
  check("combate aparece no histórico", r.status === 200 && historico.some?.((c: any) => c.id === combatId), r.status);

  /* ============ RESULTADO ============ */
  console.log("\nLimpando dados de teste…");
  await cleanup();

  console.log(`\n===== RESULTADO: ${passed} OK, ${failed} FAIL =====`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch(async (err) => {
    console.error("\nErro fatal na suíte:", err);
    try { await cleanup(); } catch { /* mantém dados para inspeção se a limpeza falhar */ }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
