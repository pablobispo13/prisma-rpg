import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

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
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader)
        return res.status(401).json({ message: "Não autorizado" });

      const [scheme, token] = authHeader.split(" ");
      if (scheme !== "Bearer" || !token)
        return res.status(401).json({ message: "Token inválido ou ausente" });

      const secret = process.env.JWT_SECRET!;
      const decoded = jwt.verify(token, secret) as jwt.JwtPayload & Partial<AuthUser>;

      if (!decoded.userId || !decoded.role || !decoded.username)
        return res.status(401).json({ message: "Token inválido" });

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
        return res.status(401).json({ message: "Sessão encerrada. Faça login novamente." });

      req.user = {
        userId: decoded.userId,
        role: decoded.role,
        username: decoded.username,
        isAdmin: !!decoded.isAdmin,
      };

      return handler(req, res);
    } catch {
      return res.status(401).json({ message: "Token inválido" });
    }
  };
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
