/**
 * Logo da empresa (Orçamento, Fase 0): conferência do arquivo ANTES de gravar. Função pura, usada pela Server Action e pelos testes.
 *
 * Aceita só PNG, JPG e WEBP, de até 512 KB. O tipo vem do CONTEÚDO (assinatura do arquivo), nunca do nome nem do tipo que o navegador
 * declarou. SVG é recusado de propósito: pode carregar script. O banco confere de novo (tipo, tamanho, alfabeto e assinatura).
 */

export const MAX_LOGO_BYTES = 512 * 1024;
export const MIN_LOGO_BYTES = 100;
export const MIN_LOGO_SIDE = 32;
export const MAX_LOGO_SIDE = 4000;

export type LogoContentType = "image/png" | "image/jpeg" | "image/webp";

export function sniffImageType(bytes: Uint8Array): LogoContentType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "RIFF" &&
    String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Largura e altura de PNG e JPEG (o suficiente para recusar imagem minúscula ou gigante); WEBP devolve null. */
export function readImageSize(bytes: Uint8Array, type: LogoContentType): { width: number; height: number } | null {
  if (type === "image/png") {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! };
      }
      if (length < 2) return null;
      offset += 2 + length;
    }
    return null;
  }
  return null;
}

export type LogoCheck = { ok: true; contentType: LogoContentType; sizeBytes: number } | { ok: false; error: string };

export function checkLogoBytes(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, error: "Escolha uma imagem para o logo." };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "A imagem é grande demais. Use uma de até 512 KB." };
  if (bytes.length < MIN_LOGO_BYTES) return { ok: false, error: "A imagem é pequena demais para ser um logo." };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP (SVG e outros formatos não são aceitos)." };
  const size = readImageSize(bytes, contentType);
  if (size) {
    if (size.width < MIN_LOGO_SIDE || size.height < MIN_LOGO_SIDE) {
      return { ok: false, error: `A imagem é pequena demais (mínimo ${MIN_LOGO_SIDE} × ${MIN_LOGO_SIDE} pixels).` };
    }
    if (size.width > MAX_LOGO_SIDE || size.height > MAX_LOGO_SIDE) {
      return { ok: false, error: `A imagem é grande demais em pixels (máximo ${MAX_LOGO_SIDE} × ${MAX_LOGO_SIDE}).` };
    }
  }
  return { ok: true, contentType, sizeBytes: bytes.length };
}
