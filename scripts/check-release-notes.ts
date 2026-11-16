// Valida src/data/releaseNotes.ts. Uso: npm run release:check
// Ver docs/RELEASE_NOTES.md para o processo completo.
import { readFileSync } from "node:fs";
import { RELEASE_NOTES } from "../src/data/releaseNotes";

const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { version: string };
const errors: string[] = [];

const SEMVER = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function compareSemver(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

if (RELEASE_NOTES.length === 0) errors.push("Nenhuma versão cadastrada.");

const latest = RELEASE_NOTES[0];
if (latest && latest.version !== pkg.version) {
  errors.push(
    `A versão mais nova das notas (${latest.version}) não bate com o package.json (${pkg.version}). ` +
      `Atualize um dos dois — ver docs/RELEASE_NOTES.md.`
  );
}

const seen = new Set<string>();
RELEASE_NOTES.forEach((r, i) => {
  const where = `[${i}] v${r.version}`;
  if (!SEMVER.test(r.version)) errors.push(`${where}: versão fora do formato X.Y.Z.`);
  if (seen.has(r.version)) errors.push(`${where}: versão duplicada.`);
  seen.add(r.version);
  if (!DATE.test(r.date) || Number.isNaN(Date.parse(r.date))) errors.push(`${where}: data inválida (use AAAA-MM-DD).`);
  if (!r.title.trim()) errors.push(`${where}: título vazio.`);
  if (r.items.length === 0) errors.push(`${where}: nenhum item.`);
  r.items.forEach((item, j) => {
    if (!item.text.trim()) errors.push(`${where} item ${j}: texto vazio.`);
  });
  const next = RELEASE_NOTES[i + 1];
  if (next && SEMVER.test(next.version) && compareSemver(r.version, next.version) <= 0) {
    errors.push(`${where}: deve ser maior que a versão seguinte da lista (v${next.version}) — a mais nova fica em primeiro.`);
  }
});

if (errors.length) {
  console.error("✗ Release notes com problemas:\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`✓ Release notes OK — ${RELEASE_NOTES.length} versão(ões), mais nova v${latest.version}.`);
