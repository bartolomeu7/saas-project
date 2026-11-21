import "server-only";

import type { PdfLogo } from "./pdf-document";

/**
 * Logo no formato que o react-pdf desenha (PNG ou JPG). O WEBP, aceito no cadastro da empresa, é convertido para PNG;
 * se a conversão falhar (imagem corrompida), devolve null e o PDF sai só com o nome da empresa.
 */
export async function logoForPdf(stored: { contentType: string; bytes: Buffer } | null): Promise<PdfLogo | null> {
  if (!stored) return null;
  if (stored.contentType === "image/png") return { data: stored.bytes, format: "png" };
  if (stored.contentType === "image/jpeg") return { data: stored.bytes, format: "jpg" };
  if (stored.contentType === "image/webp") {
    try {
      const sharp = (await import("sharp")).default;
      const png = await sharp(stored.bytes, { limitInputPixels: 25_000_000 }).resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      return { data: png, format: "png" };
    } catch (error) {
      console.error("[orcamento] não foi possível converter o logo WEBP:", error instanceof Error ? error.message : error);
      return null;
    }
  }
  return null;
}
