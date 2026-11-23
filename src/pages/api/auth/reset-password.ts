import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { prisma } from "../../../lib/prisma";
import { hashResetToken, isWellFormedResetToken } from "../../../lib/passwordReset";

const INVALID_LINK = "Link inválido ou expirado. Peça um novo e-mail de recuperação.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { token, password } = req.body ?? {};
  if (!isWellFormedResetToken(token)) return res.status(400).json({ message: INVALID_LINK });
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ message: "A senha precisa ter no mínimo 6 caracteres" });
  }

  const user = await prisma.user.findFirst({
    where: { resetTokenHash: hashResetToken(token), resetTokenExpires: { gt: new Date() } },
  });
  if (!user) return res.status(400).json({ message: INVALID_LINK });

  const hashed = await bcrypt.hash(password, 10);

  // updateMany com o hash no filtro garante uso único mesmo com duas requisições simultâneas.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, resetTokenHash: user.resetTokenHash },
    data: {
      password: hashed,
      // Invalida todos os JWTs emitidos até agora (logout em todos os dispositivos).
      passwordChangedAt: new Date(),
      resetTokenHash: null,
      resetTokenExpires: null,
      resetRequestedAt: null,
    },
  });
  if (count === 0) return res.status(400).json({ message: INVALID_LINK });

  return res.json({
    message: "Senha redefinida! Todos os dispositivos foram desconectados. Faça login com a nova senha.",
  });
}
