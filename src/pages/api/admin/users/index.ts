import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  const user = req.user!;
  if (!user.isAdmin) {
    res.status(403).json({ message: "Acesso restrito a administradores" });
    return;
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const roleFilter = typeof req.query.role === "string" ? req.query.role : "";

  const users = await prisma.user.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(roleFilter === "MESTRE" || roleFilter === "JOGADOR"
        ? { role: roleFilter }
        : {}),
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isAdmin: true,
    },
    orderBy: { username: "asc" },
    take: 50,
  });

  res.status(200).json({ users });
}

export default authenticate(handler);
