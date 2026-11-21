/**
 * Leitura e validação do formulário "Aparência do orçamento" (Configurações → Empresa). Função pura, usada pela ação do servidor
 * e pelos testes. A chave Pix é conferida (tipo e dígitos verificadores) e salva já normalizada; o banco confere de novo.
 */
import { normalizePixKey } from "./pix.ts";
import { INTRO_TEXT_MAX, normalizeHexColor, type QuoteTemplate } from "./style.ts";

export interface QuoteStyleFormValues {
  template: QuoteTemplate;
  brandColor: string;
  introText: string;
  pixKey: string;
  pixName: string;
  showAcceptance: boolean;
}

export type QuoteStyleFormResult = { ok: true; values: QuoteStyleFormValues } | { ok: false; error: string; field: string };

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() : "");

export function readQuoteStyleForm(formData: FormData): QuoteStyleFormResult {
  const template = text(formData.get("template"));
  if (template !== "classic" && template !== "modern") return { ok: false, error: "Escolha o modelo do orçamento.", field: "template" };

  const brandColor = normalizeHexColor(text(formData.get("brandColor")));
  if (!brandColor) return { ok: false, error: "Cor inválida. Escolha uma cor ou digite no formato #1f2937.", field: "brandColor" };

  const introText = text(formData.get("introText"));
  if (introText.length > INTRO_TEXT_MAX) return { ok: false, error: `O texto de apresentação pode ter no máximo ${INTRO_TEXT_MAX} caracteres.`, field: "introText" };

  let pixKey = "";
  const rawPix = text(formData.get("pixKey"));
  if (rawPix !== "") {
    const checked = normalizePixKey(rawPix);
    if (!checked.ok) return { ok: false, error: checked.error, field: "pixKey" };
    pixKey = checked.key;
  }

  const pixName = text(formData.get("pixName"));
  if (pixName.length > 25) return { ok: false, error: "O nome do recebedor do Pix pode ter no máximo 25 caracteres.", field: "pixName" };

  return { ok: true, values: { template, brandColor, introText, pixKey, pixName, showAcceptance: formData.get("showAcceptance") === "on" } };
}
