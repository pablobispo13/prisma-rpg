import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary (free tier) guarda as imagens de personagem de forma persistente,
 * no mesmo esquema do overlay-live (que usa a pasta "overlay-live").
 * Defina CLOUDINARY_URL no ambiente para ativar; sem isso, a listagem e o
 * upload usam a pasta local public/characters (bom para dev, mas o disco de
 * plataformas como Render/Vercel é efêmero e some no deploy).
 *
 * Pegue o valor em: Cloudinary > Dashboard > "API Environment variable"
 * CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 */
export const USE_CLOUDINARY = !!process.env.CLOUDINARY_URL;
if (USE_CLOUDINARY) cloudinary.config({ secure: true });

// Pasta própria deste sistema no Cloudinary (separada da "overlay-live")
export const CLOUD_FOLDER = "prisma-rpg";

export { cloudinary };
