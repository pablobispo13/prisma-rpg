import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { prisma } from "../../../lib/prisma";
import { normalizeEmail } from "../../../lib/userEmail";
import { setSessionCookie, signSession } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!email || !password) return res.status(400).json({ message: "Todos os campos são obrigatórios" });

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) return res.status(401).json({ message: "Usuário não encontrado" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: "Senha incorreta" });

  setSessionCookie(
    res,
    signSession({ userId: user.id, role: user.role, username: user.username, isAdmin: user.isAdmin })
  );
  res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role, isAdmin: user.isAdmin } });
}
