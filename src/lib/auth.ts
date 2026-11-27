import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { clearSessionCookie, failsCsrfCheck, getRequestToken } from "./session";
import { withPulsar } from "./pulsar";

export type AuthUser = {
  userId: string;
  role: "MESTRE" | "JOGADOR";
  username: string;
  isAdmin: boolean;
};

export type CampaignScope = {
  campaignId: string;
  isMaster: boolean;
};

export interface AuthenticatedRequest extends NextApiRequest {
  user?: AuthUser;
  campaign?: CampaignScope;
  /** De onde veio a sessão: cookie HttpOnly (app) ou header Bearer (scripts/migração). */
  authSource?: "cookie" | "bearer";
}

/**
 * true se o token foi emitido antes da última troca de senha — ou seja, a sessão
 * foi encerrada ("logout em todos os dispositivos"). `iat` vem em segundos.
 */
export function isTokenRevoked(iat: number | undefined, passwordChangedAt: Date | null | undefined) {
  if (!passwordChangedAt) return false;
  if (typeof iat !== "number") return true;
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

export function authenticate(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => void | Promise<void>
) {
  // withPulsar mede toda rota autenticada (status, duração, erros e userId) e
  // envia ao Pulsar. Sem PULSAR_URL/PULSAR_KEY no ambiente, não faz nada.
  return withPulsar(async (req: AuthenticatedRequest, res: NextApiResponse) => {
    const found = getRequestToken(req);
    if (!found) return res.status(401).json({ message: "Não autorizado" });

    const unauthorized = (message: string) => {
      if (found.source === "cookie") clearSessionCookie(res);
      return res.status(401).json({ message });
    };

    if (found.source === "cookie" && failsCsrfCheck(req))
      return res.status(403).json({ message: "Requisição bloqueada (CSRF)" });

    try {
      const decoded = jwt.verify(found.token, process.env.JWT_SECRET!) as jwt.JwtPayload & Partial<AuthUser>;

      if (!decoded.userId || !decoded.role || !decoded.username)
        return unauthorized("Token inválido");

      let session: { passwordChangedAt: Date | null } | null;
      try {
        session = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { passwordChangedAt: true },
        });
      } catch (err) {
        // Falha de banco não deve deslogar o usuário (o cliente desloga em qualquer 401).
        console.error("[auth] falha ao validar sessão:", err);
        return res.status(500).json({ message: "Erro ao validar a sessão" });
      }
      if (!session || isTokenRevoked(decoded.iat, session.passwordChangedAt))
        return unauthorized("Sessão encerrada. Faça login novamente.");

      req.user = {
        userId: decoded.userId,
        role: decoded.role,
        username: decoded.username,
        isAdmin: !!decoded.isAdmin,
      };
      req.authSource = found.source;

      return handler(req, res);
    } catch {
      return unauthorized("Token inválido");
    }
  }, { getUserId: (req) => req.user?.userId });
}

/**
 * Wrapper que exige um campaignId válido (header `x-campaign-id` ou query `campaignId`)
 * e que o usuário autenticado tenha acesso (mestre dono ou membro). Popula `req.campaign`.
 */
export function withCampaign(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => void | Promise<void>
) {
  return authenticate(async (req, res) => {
    // Import dinâmico evita ciclo com lib/campaignAccess (que importa lib/auth)
    const { getCampaignAccess } = await import("./campaignAccess");

    const headerId = req.headers["x-campaign-id"];
    const queryId = req.query.campaignId;
    const campaignId =
      (typeof headerId === "string" && headerId) ||
      (typeof queryId === "string" && queryId) ||
      null;

    if (!campaignId) {
      return res.status(400).json({ message: "campaignId obrigatório" });
    }

    const access = await getCampaignAccess(req.user!, campaignId);
    if (!access) {
      return res.status(403).json({ message: "Sem acesso a esta mesa" });
    }

    req.campaign = { campaignId, isMaster: access.isMaster };
    return handler(req, res);
  });
}
