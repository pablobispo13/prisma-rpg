import type { NextApiResponse } from "next";
import { authenticate, AuthenticatedRequest } from "../../../lib/auth";
import { cloudinary, CLOUD_FOLDER, USE_CLOUDINARY } from "../../../lib/cloudinary";
import fs from "fs";
import path from "path";

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

// Upload chega como data URI em JSON — precisa de limite maior que o padrão (1mb)
export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

function listLocalImages(): string[] {
  const dir = path.join(process.cwd(), "public", "characters");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => ALLOWED_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

// Imagens da pasta prisma-rpg no Cloudinary, como URLs completas
async function listCloudinaryImages(): Promise<string[]> {
  if (!USE_CLOUDINARY) return [];
  const result = await cloudinary.api.resources({
    type: "upload",
    prefix: `${CLOUD_FOLDER}/`,
    resource_type: "image",
    max_results: 200,
  });
  return result.resources
    .map((r: { secure_url: string }) => r.secure_url)
    .sort((a: string, b: string) => a.localeCompare(b));
}

/**
 * Biblioteca de imagens de personagem. Apenas usuários com isAdmin.
 *
 * GET  — lista as imagens: locais (public/characters/, nome do arquivo) +
 *        Cloudinary (pasta prisma-rpg, URL completa).
 * POST — sobe uma nova imagem { dataUri, filename } para a pasta prisma-rpg
 *        no Cloudinary; sem CLOUDINARY_URL configurado, salva localmente (dev).
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ message: "Apenas o admin pode gerenciar imagens" });
    return;
  }

  if (req.method === "GET") {
    try {
      const [local, cloud] = await Promise.all([
        Promise.resolve(listLocalImages()),
        listCloudinaryImages().catch((err) => {
          console.error("[/api/admin/images] Cloudinary:", err);
          return [] as string[];
        }),
      ]);
      res.status(200).json({ images: [...cloud, ...local] });
    } catch (err) {
      console.error("[/api/admin/images]", err);
      res.status(500).json({ message: "Erro ao listar imagens" });
    }
    return;
  }

  if (req.method === "POST") {
    const { dataUri, filename } = req.body ?? {};
    if (typeof dataUri !== "string" || !dataUri.startsWith("data:image/")) {
      res.status(400).json({ message: "Envie uma imagem válida (dataUri)" });
      return;
    }
    const ext = path.extname(typeof filename === "string" ? filename : "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      res.status(400).json({ message: "Formato não suportado (png, jpg, jpeg, webp, gif)" });
      return;
    }

    try {
      if (USE_CLOUDINARY) {
        const result = await cloudinary.uploader.upload(dataUri, {
          folder: CLOUD_FOLDER,
          resource_type: "image",
          use_filename: true,
          unique_filename: true,
        });
        res.status(201).json({ image: result.secure_url });
        return;
      }

      // Fallback local (dev): salva em public/characters
      const dir = path.join(process.cwd(), "public", "characters");
      fs.mkdirSync(dir, { recursive: true });
      const base = path.basename(filename, ext).replace(/[^\w.-]+/g, "_") || "imagem";
      let safe = `${base}${ext}`;
      let n = 1;
      while (fs.existsSync(path.join(dir, safe))) safe = `${base}-${n++}${ext}`;
      const buffer = Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");
      fs.writeFileSync(path.join(dir, safe), buffer);
      res.status(201).json({ image: safe });
    } catch (err) {
      console.error("[/api/admin/images] upload:", err);
      res.status(500).json({ message: "Erro ao enviar imagem" });
    }
    return;
  }

  res.status(405).end();
}

export default authenticate(handler);
