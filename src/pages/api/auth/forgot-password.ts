import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getAppUrl, sendPasswordResetEmail } from "../../../lib/mailer";
import { normalizeEmail } from "../../../lib/userEmail";
import {
  createResetToken,
  RESET_REQUEST_COOLDOWN_MS,
  RESET_TOKEN_TTL_MINUTES,
} from "../../../lib/passwordReset";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: "Informe o e-mail" });

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    return res.status(404).json({ message: "Nenhuma conta encontrada com esse e-mail." });
  }

  const now = Date.now();
  if (user.resetRequestedAt) {
    const waitMs = RESET_REQUEST_COOLDOWN_MS - (now - user.resetRequestedAt.getTime());
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      return res
        .status(429)
        .json({ message: `Um e-mail acabou de ser enviado. Aguarde ${seconds}s para pedir outro.` });
    }
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
    // Token no fragmento (#): o navegador nunca o envia ao servidor, então ele
    // não aparece em logs, no header Referer nem no cache do service worker.
    const link = `${getAppUrl()}/redefinir-senha#token=${token}`;
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

  return res.json({ message: "Enviamos um link para redefinir a senha." });
}
