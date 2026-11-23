import type { NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { getRequestToken, setSessionCookie } from "../../../lib/session";

async function handler(req: AuthenticatedRequest, res: NextApiResponse): Promise<void> {
    if (req.method !== "GET") { res.status(405).end(); return; }

    const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            isAdmin: true,
            characters: true,
        },
    });

    if (!user) {
        res.status(401).json({ message: "Usuário não encontrado" });
        return;
    }

    // Migração: clientes antigos guardavam o JWT no localStorage e o enviam aqui
    // uma única vez via Bearer. Convertemos para o cookie HttpOnly.
    if (req.authSource === "bearer") {
        setSessionCookie(res, getRequestToken(req)!.token);
    }

    res.status(200).json({ user });
}

export default authenticate(handler);
