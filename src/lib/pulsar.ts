/**
 * Pulsar SDK — copie este arquivo para o app que você quer monitorar
 * (ex: src/lib/pulsar.ts). Não tem dependências.
 *
 * Variáveis de ambiente do app monitorado:
 *   PULSAR_URL=https://seu-pulsar.vercel.app
 *   PULSAR_KEY=psr_...            (gerada ao cadastrar o app no Pulsar)
 *   PULSAR_ENV=production         (opcional — detectado sozinho, ver detectEnvironment)
 *
 * A MESMA chave pode ser usada em todos os ambientes (local, preview, produção):
 * cada evento leva o ambiente e o painel filtra por ele.
 *
 * Sem essas variáveis o SDK não faz nada (útil em dev).
 * Falhas de envio são silenciosas: o Pulsar fora do ar nunca derruba o seu app.
 */

export type PulsarEvent = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp?: number;
  /** Rota "padrão" (ex: /api/characters/[id]). Se omitida, o Pulsar normaliza ids sozinho. */
  route?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  error?: string;
  /** "production" | "preview" | "development". Se omitido, usa detectEnvironment(). */
  environment?: string;
};

/**
 * Ambiente do app, nesta ordem:
 *  1. PULSAR_ENV    — força um valor (ex: "production" num `next start` local de teste)
 *  2. VERCEL_ENV    — "production" | "preview" | "development" (definido pela Vercel)
 *  3. NODE_ENV      — "production" vira production; qualquer outro, development (= local)
 */
export function detectEnvironment() {
  const env = process.env.PULSAR_ENV || process.env.VERCEL_ENV;
  if (env) return env;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

const SEND_TIMEOUT_MS = 1500;
// Rotas que não vale a pena registrar (o próprio health check, assets...)
const IGNORE = [/^\/_next\//, /^\/favicon/, /\.(js|css|png|jpg|svg|ico|webp|woff2?)$/];

function config() {
  const url = process.env.PULSAR_URL;
  const key = process.env.PULSAR_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

/**
 * Mantém a função serverless viva até o envio terminar. Usa o mesmo contexto
 * que o pacote @vercel/functions lê (disponível em qualquer função da Vercel).
 * Fora da Vercel, devolve null e o envio é aguardado normalmente.
 */
function vercelWaitUntil(): ((p: Promise<unknown>) => void) | null {
  const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
    Symbol.for("@vercel/request-context")
  ];
  return ctx?.get?.()?.waitUntil ?? null;
}

export function sendEvents(events: PulsarEvent[]): Promise<void> {
  const cfg = config();
  if (!cfg || !events.length) return Promise.resolve();
  return fetch(`${cfg.url}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pulsar-key": cfg.key },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  })
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Envia um evento SEM nunca atrasar a resposta do app.
 * - Vercel: waitUntil mantém a função viva até o envio terminar.
 * - Servidor de longa duração (Docker, `next start`, Express): o processo
 *   continua vivo, então basta disparar.
 */
export function track(event: PulsarEvent): void {
  if (IGNORE.some((re) => re.test(event.path))) return;
  const promise = sendEvents([{ timestamp: Date.now(), environment: detectEnvironment(), ...event }]);
  vercelWaitUntil()?.(promise);
}

type HeaderBag = Record<string, string | string[] | undefined>;

function firstHeader(headers: HeaderBag, name: string) {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function clientIp(headers: HeaderBag, fallback?: string) {
  return firstHeader(headers, "x-forwarded-for")?.split(",")[0].trim() || firstHeader(headers, "x-real-ip") || fallback;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

// ------------------------------------------------------------------------
// Next.js — Pages Router (src/pages/api/*)
// ------------------------------------------------------------------------

type NodeReq = { method?: string; url?: string; headers: HeaderBag; socket?: { remoteAddress?: string } };
type NodeRes = { statusCode: number; headersSent?: boolean };

/**
 * export default withPulsar(handler)
 *
 * `getUserId` opcional: ex. (req) => req.user?.userId  (se o seu authenticate()
 * coloca o usuário em req.user, como no Prisma RPG).
 */
export function withPulsar<Req extends NodeReq, Res extends NodeRes>(
  handler: (req: Req, res: Res) => unknown | Promise<unknown>,
  options: { getUserId?: (req: Req) => string | undefined; route?: string } = {}
) {
  return async (req: Req, res: Res) => {
    const started = performance.now();
    let error: unknown;
    try {
      return await handler(req, res);
    } catch (err) {
      error = err;
      throw err;
    } finally {
      track({
        method: req.method ?? "GET",
        path: req.url ?? "/",
        route: options.route,
        // Exceção sem resposta enviada = o Next responde 500
        statusCode: error && !res.headersSent ? 500 : res.statusCode,
        durationMs: Math.round(performance.now() - started),
        ip: clientIp(req.headers, req.socket?.remoteAddress),
        userAgent: firstHeader(req.headers, "user-agent"),
        userId: safe(() => options.getUserId?.(req)),
        error: error ? errorMessage(error) : undefined,
      });
    }
  };
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------------
// Next.js — App Router (route.ts)
// ------------------------------------------------------------------------

/** export const GET = withPulsarRoute(async (req) => Response.json(...)) */
export function withPulsarRoute<Ctx>(
  handler: (req: Request, ctx: Ctx) => Response | Promise<Response>,
  options: { route?: string } = {}
) {
  return async (req: Request, ctx: Ctx) => {
    const started = performance.now();
    const url = new URL(req.url);
    const base = {
      method: req.method,
      path: url.pathname,
      route: options.route,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    };
    try {
      const res = await handler(req, ctx);
      track({ ...base, statusCode: res.status, durationMs: Math.round(performance.now() - started) });
      return res;
    } catch (err) {
      track({ ...base, statusCode: 500, durationMs: Math.round(performance.now() - started), error: errorMessage(err) });
      throw err;
    }
  };
}

// ------------------------------------------------------------------------
// Express / Node http
// ------------------------------------------------------------------------

type ExpressReq = NodeReq & { originalUrl?: string; route?: { path?: string }; baseUrl?: string; ip?: string };
type ExpressRes = NodeRes & { on: (ev: "finish", cb: () => void) => void; locals?: { error?: unknown } };

/** app.use(pulsarMiddleware()) — registre antes das rotas. */
export function pulsarMiddleware(options: { getUserId?: (req: ExpressReq) => string | undefined } = {}) {
  return (req: ExpressReq, res: ExpressRes, next: () => void) => {
    const started = performance.now();
    res.on("finish", () => {
      const route = req.route?.path ? `${req.baseUrl ?? ""}${req.route.path}` : undefined;
      track({
        method: req.method ?? "GET",
        path: req.originalUrl ?? req.url ?? "/",
        route,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - started),
        ip: clientIp(req.headers, req.ip ?? req.socket?.remoteAddress),
        userAgent: firstHeader(req.headers, "user-agent"),
        userId: safe(() => options.getUserId?.(req)),
        error: res.locals?.error ? errorMessage(res.locals.error) : undefined,
      });
    });
    next();
  };
}
