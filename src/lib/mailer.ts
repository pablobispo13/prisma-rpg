import nodemailer, { Transporter } from "nodemailer";

/**
 * Envio de e-mail via SMTP (funciona com Gmail + senha de app, Brevo, Outlook etc.).
 *
 * Variáveis de ambiente:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — credenciais do provedor
 *   MAIL_FROM  — remetente, ex: "Prisma RPG <seuemail@gmail.com>" (padrão: SMTP_USER)
 *
 * Sem SMTP configurado em desenvolvimento, o e-mail é apenas impresso no console.
 */

let transporter: Transporter | null = null;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS direto; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail) {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS).");
    }
    console.info(`[mailer] SMTP não configurado — e-mail para ${mail.to}:\n${mail.text}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    ...mail,
  });
}

/** URL pública do app, usada nos links dos e-mails. Nunca derivada do header Host. */
export function getAppUrl() {
  const url = process.env.APP_URL;
  if (url) return url.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL não configurada.");
  }
  return "http://localhost:3000";
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Aviso de segurança enviado depois que a senha foi trocada. */
export async function sendPasswordChangedEmail(to: string, username: string, forgotLink: string) {
  const name = escapeHtml(username);
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await sendMail({
    to,
    subject: "Prisma RPG — sua senha foi alterada",
    text:
      `Olá, ${username}!\n\n` +
      `A senha da sua conta no Prisma RPG foi alterada em ${when} (horário de Brasília), ` +
      `e todos os aparelhos conectados foram desconectados.\n\n` +
      `Se foi você, está tudo certo. Se NÃO foi você, recupere sua conta agora:\n${forgotLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
        <h2 style="color:#5a6bcf;margin:0 0 16px">Prisma RPG</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>A senha da sua conta foi alterada em <strong>${when}</strong> (horário de Brasília),
           e todos os aparelhos conectados foram desconectados.</p>
        <p>Se foi você, está tudo certo — não precisa fazer nada.</p>
        <p><strong>Se não foi você</strong>, recupere sua conta agora:</p>
        <p style="margin:24px 0">
          <a href="${forgotLink}" style="background:#c0392b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
            Não fui eu — recuperar conta
          </a>
        </p>
      </div>`,
  });
}

export async function sendPasswordResetEmail(to: string, username: string, link: string, minutes: number) {
  const name = escapeHtml(username);
  await sendMail({
    to,
    subject: "Prisma RPG — redefinir sua senha",
    text:
      `Olá, ${username}!\n\n` +
      `Recebemos um pedido para redefinir a senha da sua conta no Prisma RPG.\n` +
      `Abra o link abaixo para escolher uma nova senha (válido por ${minutes} minutos):\n\n` +
      `${link}\n\n` +
      `Se não foi você, ignore este e-mail — sua senha continua a mesma.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
        <h2 style="color:#5a6bcf;margin:0 0 16px">Prisma RPG</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#5a6bcf;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
            Redefinir senha
          </a>
        </p>
        <p style="font-size:13px;color:#666">O link vale por ${minutes} minutos e só pode ser usado uma vez.</p>
        <p style="font-size:13px;color:#666">Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>
        <p style="font-size:12px;color:#999;word-break:break-all">Se o botão não funcionar, copie e cole: ${link}</p>
      </div>`,
  });
}
