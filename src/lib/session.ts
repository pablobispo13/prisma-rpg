import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";

/**
 * Sessão via cookie HttpOnly: o JWT nunca fica acessível ao JavaScript da página,
 * então um XSS não consegue roubá-lo.
 *
 * CSRF: o cookie é SameSite=Lax (outro site não consegue fazer POST com ele) e,
 * além disso, requisições que alteram dados exigem o header CSRF_HEADER, que um
 * site de terceiros não consegue enviar sem CORS (que não liberamos).
 */
export const SESSION_COOKIE = "prisma_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "prisma-rpg";

export type SessionPayload = {
  userId: string;
  role: "MESTRE" | "JOGADOR";
  username: string;
  isAdmin: boolean;
};

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: SESSION_MAX_AGE_S });
}

function cookie(value: string, maxAge: number) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res: NextApiResponse, value: string) {
  const prev = res.getHeader("Set-Cookie");
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader("Set-Cookie", [...list, value]);
}

export function setSessionCookie(res: NextApiResponse, token: string) {
  appendSetCookie(res, cookie(token, SESSION_MAX_AGE_S));
}

export function clearSessionCookie(res: NextApiResponse) {
  appendSetCookie(res, cookie("", 0));
}

/**
 * Token da requisição. O header Bearer tem prioridade: é usado pelos scripts de
 * teste e pela migração única do token antigo do localStorage (ver /api/auth/me).
 */
export function getRequestToken(req: NextApiRequest): { token: string; source: "bearer" | "cookie" } | null {
  const header = req.headers.authorization;
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme === "Bearer" && token) return { token, source: "bearer" };
  }
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  return fromCookie ? { token: fromCookie, source: "cookie" } : null;
}

/** Métodos que alteram dados precisam do header anti-CSRF quando a sessão vem do cookie. */
export function failsCsrfCheck(req: NextApiRequest) {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  return req.headers[CSRF_HEADER] !== CSRF_VALUE;
}
