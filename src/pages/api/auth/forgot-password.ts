import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getAppUrl, sendPasswordResetEmail } from "../../../lib/mailer";
import {
  createResetToken,
  RESET_REQUEST_COOLDOWN_MS,
  RESET_TOKEN_TTL_MINUTES,
} from "../../../lib/passwordReset";

// Mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados.
const GENERIC_MESSAGE =
  "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email) return res.status(400).json({ message: "Informe o e-mail" });

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) return res.json({ message: GENERIC_MESSAGE });

  const now = Date.now();
  if (user.resetRequestedAt && now - user.resetRequestedAt.getTime() < RESET_REQUEST_COOLDOWN_MS) {
    return res.json({ message: GENERIC_MESSAGE });
  }

  const { token, tokenHash } = createResetToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: tokenHash,
      resetTokenExpires: new Date(now + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      resetRequestedAt: new Date(now),
    },
  });

  try {
    const link = `${getAppUrl()}/redefinir-senha?token=${token}`;
    await sendPasswordResetEmail(user.email, user.username, link, RESET_TOKEN_TTL_MINUTES);
  } catch (err) {
    console.error("[forgot-password] falha ao enviar e-mail:", err);
    // Libera novo pedido imediatamente, já que este não chegou.
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: null, resetTokenExpires: null, resetRequestedAt: null },
    });
    return res
      .status(500)
      .json({ message: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." });
  }

  return res.json({ message: GENERIC_MESSAGE });
}
