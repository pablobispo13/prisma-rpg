/**
 * Resolve o src da imagem de um personagem.
 * Imagens antigas são nomes de arquivo em public/characters/;
 * imagens novas (Cloudinary, pasta prisma-rpg) são URLs completas.
 */
export function characterImageSrc(image?: string | null): string | undefined {
  if (!image) return undefined;
  return /^https?:\/\//.test(image) ? image : `/characters/${image}`;
}
