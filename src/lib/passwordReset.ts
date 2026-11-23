import crypto from "crypto";

/** Validade do link de redefinição. */
export const RESET_TOKEN_TTL_MINUTES = 30;
/** Intervalo mínimo entre dois pedidos para a mesma conta (evita spam de e-mails). */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

/** Gera o token que vai no link (só existe no e-mail) e o hash que vai pro banco. */
export function createResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isWellFormedResetToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
