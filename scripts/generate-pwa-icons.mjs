// Gera os ícones PNG do PWA a partir de public/favicon.svg.
// Uso: node scripts/generate-pwa-icons.mjs (rodar de novo se o logo mudar)
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";

const BG = "#0e0e1a"; // mesmo fundo do app (Layout / theme_color do manifest)
const svg = await readFile("public/favicon.svg");
await mkdir("public/icons", { recursive: true });

// padding = fração do lado reservada como margem em volta do logo.
// Maskable exige o conteúdo dentro do círculo central de 80% (safe zone),
// por isso usa margem maior — o launcher do Android recorta as bordas.
const targets = [
  { file: "icon-192.png", size: 192, padding: 0.08 },
  { file: "icon-512.png", size: 512, padding: 0.08 },
  { file: "icon-maskable-512.png", size: 512, padding: 0.22 },
  { file: "apple-touch-icon.png", size: 180, padding: 0.12 },
];

for (const { file, size, padding } of targets) {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await sharp(svg, { density: 512 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/${file}`);
  console.log(`public/icons/${file}`);
}
