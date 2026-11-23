import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma";
import { normalizeEmail } from "../../../lib/userEmail";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!username || !email || !password) return res.status(400).json({ message: "Todos os campos são obrigatórios" });

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) return res.status(400).json({ message: "Usuário já existe" });

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, email, password: hashed, role: "JOGADOR" } });

  const token = jwt.sign(
    { userId: user.id, role: user.role, username: user.username },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
}
