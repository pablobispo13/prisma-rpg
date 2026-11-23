/**
 * E-mails são sempre salvos e buscados em minúsculas, para que "Fulano@x.com" e
 * "fulano@x.com" sejam a mesma conta.
 *
 * Não use `mode: "insensitive"` do Prisma para isso: no MongoDB ele vira um $regex
 * SEM escapar o valor (".*" casa com todos os usuários).
 */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** Escapa um texto para ser usado literalmente em filtros `contains`/`mode: "insensitive"`. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
