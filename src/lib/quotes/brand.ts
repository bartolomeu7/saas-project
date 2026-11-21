/**
 * Assinatura da marca Prime Ges no rodapé do PDF do orçamento: logo pequeno + frase de efeito + endereço do site.
 * O texto fica aqui, num lugar só, para trocar a frase sem mexer no desenho do PDF.
 */
import fs from "node:fs";
import path from "node:path";

export const BRAND_NAME = "Prime Ges";
export const BRAND_TAGLINE = "Gestão simples para o seu negócio crescer.";
export const BRAND_SITE = "primeges.com.br";
export const BRAND_LEAD = "Orçamento emitido com";

const LOGO_PATH = path.join(process.cwd(), "public", "brand", "primeges-logo-pdf.png");

let cached: Buffer | null | undefined;

/** Logo do Prime Ges (PNG pequeno, lido uma vez); null se o arquivo faltar — o rodapé sai só com o texto. */
export function brandLogo(): Buffer | null {
  if (cached === undefined) {
    try {
      cached = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}
