/**
 * Suíte de testes de integração das features de jul/2026:
 *  T1 — Fórmulas configuráveis de atributos derivados (defesa/vida máxima)
 *  T2 — Limite de ataques por rodada (por personagem, base 1)
 *  T3 — Limite de reações por rodada (por mesa, com auto-absorção)
 *  T4 — Reset de contadores na virada de rodada
 *  T5 — Formas alternativas (criação, listagem, troca fora e dentro de combate)
 *  T6 — Usuário novo sem mesa (dado para a tela de boas-vindas)
 *
 * Pré-requisito: servidor rodando (npm run dev) e DATABASE_URL no .env.
 * Uso: npx tsx scripts/test-features.ts
 * Cria dados prefixados com TESTE_AUTO e remove tudo ao final.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PREFIX = "TESTE_AUTO";
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
    where: { email: { startsWith: "teste-auto-" } },
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
  // Servidor no ar?
  try {
    await fetch(`${BASE}/api/health`);
  } catch {
    console.error(`Servidor não respondeu em ${BASE} — rode "npm run dev" antes.`);
    process.exit(1);
  }

  console.log("Limpando resíduos de execuções anteriores…");
  await cleanup();

  /* ============ SETUP ============ */
  console.log("\n== Setup: usuários, mesa e personagens ==");
  const stamp = Date.now();
  const mestre = await registerAndLogin(`${PREFIX}_mestre`, `teste-auto-mestre-${stamp}@teste.com`);
  const jogador = await registerAndLogin(`${PREFIX}_jogador`, `teste-auto-jogador-${stamp}@teste.com`);
  await prisma.user.update({ where: { id: mestre.id }, data: { role: "MESTRE" } });
  // re-login para o token carregar o papel de MESTRE
  const mestreLogin = await api("POST", "/auth/login", { body: { email: `teste-auto-mestre-${stamp}@teste.com`, password: PASSWORD } });
  mestre.token = mestreLogin.data.token;

  const campaign = await prisma.campaign.create({
    data: {
      name: `${PREFIX} Mesa`,
      masterId: mestre.id,
      archivedAt: null,
      members: { create: [{ userId: mestre.id }, { userId: jogador.id }] },
    },
  });
  const cid = campaign.id;

  const heroRes = await api("POST", "/characters", {
    token: jogador.token,
    campaignId: cid,
    body: { name: `${PREFIX} Heroi`, life: 30, maxLife: 30, baseDefense: 0, strength: 2, agility: 3, vigor: 2, intellect: 1, presence: 1 },
  });
  const hero = heroRes.data;
  const npcRes = await api("POST", "/characters", {
    token: mestre.token,
    campaignId: cid,
    body: { name: `${PREFIX} Inimigo`, life: 40, maxLife: 40, baseDefense: 0, strength: 3, agility: 2, vigor: 3, intellect: 1, presence: 1 },
  });
  const npc = npcRes.data;
  check("setup: personagens criados", heroRes.status === 201 && npcRes.status === 201, { h: heroRes.status, n: npcRes.status });

  const presetBase = { targetType: "ENEMY", diceFormula: "1d20", impactFormula: "1d6", attribute: "STRENGTH", appliesEffect: false, description: "teste" };
  const heroAttack = (await api("POST", "/actionPreset", { token: jogador.token, body: { ...presetBase, name: `${PREFIX} Espada`, type: "ATTACK", characterId: hero.id } })).data;
  const heroDodge = (await api("POST", "/actionPreset", { token: jogador.token, body: { ...presetBase, name: `${PREFIX} Esquiva`, type: "REACT", attribute: "AGILITY", characterId: hero.id } })).data;
  const npcAttack = (await api("POST", "/actionPreset", { token: mestre.token, body: { ...presetBase, name: `${PREFIX} Garra`, type: "ATTACK", characterId: npc.id } })).data;
  await api("PUT", `/characters/${hero.id}`, { token: jogador.token, body: { dodgePresetId: heroDodge.id } });
  // NPC com muitos ataques para não travar os testes de reação
  await api("PUT", `/characters/${npc.id}`, { token: mestre.token, body: { maxAttacksPerRound: 10 } });

  /* ============ T1 — FÓRMULAS ============ */
  console.log("\n== T1: Fórmulas configuráveis ==");
  let r = await api("PATCH", `/campaigns/${cid}`, { token: mestre.token, body: { defenseFormula: "3 + banana" } });
  check("fórmula inválida rejeitada (400)", r.status === 400, r.data);
  r = await api("PATCH", `/campaigns/${cid}`, { token: mestre.token, body: { defenseFormula: "10 + agilidade*2", maxLifeFormula: "20 + Vigor * 5" } });
  check("fórmulas válidas aceitas (200)", r.status === 200, r.data);
  r = await api("GET", `/campaigns/${cid}`, { token: mestre.token });
  check("fórmulas persistidas", r.data?.defenseFormula === "10 + agilidade*2" && r.data?.maxLifeFormula === "20 + Vigor * 5");
  r = await api("PATCH", `/campaigns/${cid}`, { token: jogador.token, body: { defenseFormula: "1" } });
  check("jogador não edita a mesa (403)", r.status === 403, r.status);
  r = await api("PATCH", `/campaigns/${cid}`, { token: mestre.token, body: { defenseFormula: "" } });
  const camp = await prisma.campaign.findUnique({ where: { id: cid } });
  check("fórmula vazia volta ao padrão (null)", r.status === 200 && camp?.defenseFormula === null);

  /* ============ COMBATE ============ */
  console.log("\n== Setup de combate ==");
  r = await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "startCombat", participantIds: [hero.id, npc.id] } });
  const combatId = r.data?.combat?.id;
  check("combate iniciado", r.status === 201 && !!combatId, r.status);
  r = await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "startTurn", combatId } });
  let turnId = r.data?.id;
  check("turno aberto", (r.status === 201 || r.status === 200) && !!turnId, r.status);

  /* ============ T2 — LIMITE DE ATAQUES ============ */
  console.log("\n== T2: Limite de ataques por rodada (por personagem) ==");
  r = await api("POST", "/roll", { token: jogador.token, body: { characterId: hero.id, actionPresetId: heroAttack.id, targetIds: [npc.id], combatId, turnId } });
  check("1º ataque permitido (201)", r.status === 201, r.data);
  r = await api("POST", "/roll", { token: jogador.token, body: { characterId: hero.id, actionPresetId: heroAttack.id, targetIds: [npc.id], combatId, turnId } });
  check("2º ataque bloqueado (400 ATTACK_LIMIT_REACHED)", r.status === 400 && r.data?.code === "ATTACK_LIMIT_REACHED", r.data);

  r = await api("PUT", `/characters/${hero.id}`, { token: mestre.token, body: { maxAttacksPerRound: 2 } });
  check("mestre concede 2º ataque na ficha", r.status === 200);
  r = await api("POST", "/roll", { token: jogador.token, body: { characterId: hero.id, actionPresetId: heroAttack.id, targetIds: [npc.id], combatId, turnId } });
  check("2º ataque permitido após habilidade (201)", r.status === 201, r.data);
  r = await api("POST", "/roll", { token: jogador.token, body: { characterId: hero.id, actionPresetId: heroAttack.id, targetIds: [npc.id], combatId, turnId } });
  check("3º ataque bloqueado (400)", r.status === 400 && r.data?.code === "ATTACK_LIMIT_REACHED", r.data);

  await api("PUT", `/characters/${hero.id}`, { token: jogador.token, body: { maxAttacksPerRound: 9 } });
  const heroDb = await prisma.character.findUnique({ where: { id: hero.id } });
  check("jogador NÃO consegue se dar ataques extras", heroDb?.maxAttacksPerRound === 2, heroDb?.maxAttacksPerRound);

  /* ============ T3 — LIMITE DE REAÇÕES ============ */
  console.log("\n== T3: Limite de reações por rodada ==");
  r = await api("PATCH", `/campaigns/${cid}`, { token: mestre.token, body: { reactionsPerRound: 1 } });
  check("mesa configurada com 1 reação/rodada", r.status === 200);

  const atk1 = (await api("POST", "/roll", { token: mestre.token, body: { characterId: npc.id, actionPresetId: npcAttack.id, targetIds: [hero.id], combatId, turnId } })).data?.roll;
  const atk2 = (await api("POST", "/roll", { token: mestre.token, body: { characterId: npc.id, actionPresetId: npcAttack.id, targetIds: [hero.id], combatId, turnId } })).data?.roll;
  const atk1Db = await prisma.rollResult.findUnique({ where: { id: atk1.id } });
  check("ataque abre reação pendente para alvo com esquiva", atk1Db?.pendingReaction === true, atk1Db?.pendingReaction);

  r = await api("POST", "/combat/react", { token: jogador.token, body: { rollId: atk1.id, reactionType: "DODGE", targetId: hero.id, turnId } });
  check("1ª reação da rodada permitida (200)", r.status === 200, r.data);
  r = await api("POST", "/combat/react", { token: jogador.token, body: { rollId: atk2.id, reactionType: "DODGE", targetId: hero.id, turnId } });
  check("2ª reação bloqueada (400 REACTION_LIMIT_REACHED)", r.status === 400 && r.data?.code === "REACTION_LIMIT_REACHED", r.data);
  r = await api("POST", "/combat/react", { token: jogador.token, body: { rollId: atk2.id, reactionType: "SKIP", targetId: hero.id, turnId } });
  check("absorver o dano (SKIP) sempre permitido (200)", r.status === 200, r.data);

  const atk3 = (await api("POST", "/roll", { token: mestre.token, body: { characterId: npc.id, actionPresetId: npcAttack.id, targetIds: [hero.id], combatId, turnId } })).data?.roll;
  const atk3Db = await prisma.rollResult.findUnique({ where: { id: atk3.id } });
  check("alvo sem reações: dano direto, sem fila (auto-absorve)", atk3Db?.pendingReaction === false, atk3Db?.pendingReaction);

  /* ============ T4 — RESET NA VIRADA DE RODADA ============ */
  console.log("\n== T4: Reset dos contadores na virada de rodada ==");
  // fecha turnos até a rodada virar (2 participantes)
  for (let i = 0; i < 2; i++) {
    await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "endTurn", combatId, turnId } });
    const st = await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "startTurn", combatId } });
    turnId = st.data?.id ?? turnId;
  }
  const combatDb = await prisma.combat.findUnique({ where: { id: combatId }, include: { participants: true } });
  check("rodada avançou", (combatDb?.round ?? 1) >= 2, combatDb?.round);
  check("contadores zerados na nova rodada", combatDb!.participants.every((p) => p.attacksUsed === 0 && p.reactionsUsed === 0),
    combatDb!.participants.map((p) => ({ a: p.attacksUsed, r: p.reactionsUsed })));

  /* ============ T5 — FORMAS ALTERNATIVAS ============ */
  console.log("\n== T5: Formas alternativas (transformação) ==");
  r = await api("POST", `/characters/${hero.id}/forms`, { token: jogador.token, body: { name: `${PREFIX} Zumbi` } });
  check("jogador não cria forma (403)", r.status === 403, r.status);
  r = await api("POST", `/characters/${hero.id}/forms`, { token: mestre.token, body: { name: `${PREFIX} Zumbi`, image: "zumbi-teste.png" } });
  const formId = r.data?.id;
  check("mestre cria forma (201)", r.status === 201 && !!formId, r.data);
  const formDb = await prisma.character.findUnique({ where: { id: formId } });
  check("forma guarda referência de imagem própria", formDb?.image === "zumbi-teste.png", formDb?.image);
  check("forma herdou presets e esquiva", !!formDb?.dodgePresetId);

  r = await api("GET", "/characters", { token: jogador.token, campaignId: cid });
  let mine = r.data?.characters?.filter((c: any) => c.formGroup?.primaryId === hero.id || c.id === hero.id) ?? [];
  check("forma oculta da listagem (só a ficha principal aparece)", mine.length === 1 && mine[0].id === hero.id, mine.map((c: any) => c.id));
  check("listagem traz formGroup com 2 opções", mine[0]?.formGroup?.options?.length === 2, mine[0]?.formGroup);

  // garante que o turno aberto é do herói para testar a migração do turno
  const cdb = await prisma.combat.findUnique({ where: { id: combatId }, include: { participants: true } });
  const activeP = cdb!.participants.find((p) => p.turnOrder === cdb!.currentTurnIndex);
  if (activeP?.characterId !== hero.id) {
    await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "endTurn", combatId, turnId } });
    const st = await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "startTurn", combatId } });
    turnId = st.data?.id ?? turnId;
  }

  // transformar deve LIMPAR os efeitos ativos
  const effect = await prisma.characterEffect.create({
    data: { characterId: hero.id, presetId: heroAttack.id, remainingTurns: 3, type: "DAMAGE_OVER_TIME", value: 2 },
  });

  r = await api("POST", `/characters/${hero.id}/switch-form`, { token: jogador.token, body: { formId } });
  check("jogador transforma o próprio personagem (200)", r.status === 200 && r.data?.changed === true, r.data);

  const effectDb = await prisma.characterEffect.findUnique({ where: { id: effect.id } });
  check("efeitos ativos são limpos na transformação", effectDb === null, effectDb?.characterId);

  const cdb2 = await prisma.combat.findUnique({ where: { id: combatId }, include: { participants: true, turns: true } });
  const participant = cdb2!.participants.find((p) => p.characterId === formId);
  check("participante do combate agora usa a ficha da forma", !!participant);
  const openTurn = cdb2!.turns.find((t) => !t.endedAt);
  check("turno aberto migrou para a forma", openTurn?.characterId === formId, { open: openTurn?.characterId, form: formId });

  const formPresets = await prisma.actionPreset.findMany({ where: { characterId: formId, type: "ATTACK" } });
  r = await api("POST", "/roll", { token: jogador.token, body: { characterId: formId, actionPresetId: formPresets[0].id, targetIds: [npc.id], combatId, turnId: openTurn?.id ?? turnId } });
  check("forma consegue atacar após transformação (201)", r.status === 201, r.data);

  // reação pendente bloqueia a troca de volta
  await api("PATCH", `/campaigns/${cid}`, { token: mestre.token, body: { reactionsPerRound: null } });
  const atkForm = (await api("POST", "/roll", { token: mestre.token, body: { characterId: npc.id, actionPresetId: npcAttack.id, targetIds: [formId], combatId, turnId: openTurn?.id ?? turnId } })).data?.roll;
  r = await api("POST", `/characters/${hero.id}/switch-form`, { token: jogador.token, body: { formId: hero.id } });
  check("troca bloqueada com reação pendente (400)", r.status === 400, r.data);
  await api("POST", "/combat/react", { token: jogador.token, body: { rollId: atkForm.id, reactionType: "SKIP", targetId: formId, turnId: openTurn?.id ?? turnId } });
  r = await api("POST", `/characters/${hero.id}/switch-form`, { token: jogador.token, body: { formId: hero.id } });
  check("troca de volta à base após resolver reação (200)", r.status === 200, r.data);

  // encerra combate e testa exclusão em cascata
  await api("POST", "/combat/control", { token: mestre.token, campaignId: cid, body: { action: "endCombat", combatId } });
  r = await api("DELETE", `/characters/${hero.id}`, { token: mestre.token });
  const formCount = await prisma.character.count({ where: { id: formId } });
  check("excluir principal remove as formas junto (204 + 0 formas)", r.status === 204 && formCount === 0, { status: r.status, formCount });

  /* ============ T6 — USUÁRIO NOVO SEM MESA ============ */
  console.log("\n== T6: Usuário novo sem mesa (tela de boas-vindas) ==");
  const novato = await registerAndLogin(`${PREFIX}_novato`, `teste-auto-novato-${stamp}@teste.com`);
  r = await api("GET", "/campaigns", { token: novato.token });
  check("usuário novo tem lista de mesas vazia (front leva ao /bem-vindo)", r.status === 200 && (r.data?.campaigns ?? []).length === 0, r.data?.campaigns?.length);

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
