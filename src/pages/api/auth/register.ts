import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { normalizeEmail } from "../../../lib/userEmail";
import { setSessionCookie, signSession } from "../../../lib/session";

const EMAIL_TAKEN = "Já existe uma conta com esse e-mail";
const USERNAME_TAKEN = "Esse nome de usuário já está em uso";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!username || !email || !password) return res.status(400).json({ message: "Todos os campos são obrigatórios" });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true },
  });
  if (existing) {
    return res.status(400).json({ message: existing.email === email ? EMAIL_TAKEN : USERNAME_TAKEN });
  }

  const hashed = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await prisma.user.create({ data: { username, email, password: hashed, role: "JOGADOR" } });
  } catch (err) {
    // Dois cadastros simultâneos com o mesmo e-mail/nome: o índice único barra o segundo.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      return res.status(400).json({ message: target.includes("username") ? USERNAME_TAKEN : EMAIL_TAKEN });
    }
    throw err;
  }

  setSessionCookie(
    res,
    signSession({ userId: user.id, role: user.role, username: user.username, isAdmin: user.isAdmin })
  );
  res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role, isAdmin: user.isAdmin } });
}
