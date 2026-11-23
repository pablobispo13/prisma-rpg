/**
 * Normaliza User.email para minúsculas (nov/2026).
 *
 * A partir da v0.4.0, login/cadastro/recuperação de senha buscam o e-mail em
 * minúsculas. Contas antigas cadastradas com maiúsculas ("Fulano@x.com") não
 * seriam encontradas até rodar este script.
 *
 * Seguro e idempotente: se dois usuários colidirem ao normalizar
 * ("A@x.com" e "a@x.com"), nenhum deles é alterado e o conflito é listado
 * para resolução manual.
 *
 * Uso:
 *   npx tsx scripts/normalize-user-emails.ts          # só mostra o que faria
 *   npx tsx scripts/normalize-user-emails.ts --apply  # aplica
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, username: true } });

  const groups = new Map<string, typeof users>();
  for (const u of users) {
    const key = u.email.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }

  let changed = 0;
  for (const [normalized, group] of groups) {
    if (group.length > 1) {
      console.warn(`CONFLITO (não alterado): ${group.map((u) => `${u.username} <${u.email}>`).join(", ")}`);
      continue;
    }
    const [u] = group;
    if (u.email === normalized) continue;
    console.log(`${apply ? "Atualizando" : "Atualizaria"}: ${u.username}  ${u.email} -> ${normalized}`);
    if (apply) await prisma.user.update({ where: { id: u.id }, data: { email: normalized } });
    changed++;
  }

  console.log(
    `\n${users.length} usuários, ${changed} ${apply ? "atualizados" : "a atualizar"}.` +
      (apply ? "" : " Rode com --apply para aplicar.")
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
