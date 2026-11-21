/**
 * Aparência e conteúdo extra do PDF do orçamento, configurados por empresa (modelo, cor da marca, texto de apresentação, Pix, aceite).
 * Função pura: lê o JSON salvo em company_settings.operational_preferences.quote_style com tolerância (valor ruim vira o padrão)
 * e calcula as cores derivadas (texto legível sobre a cor da marca, tons suaves).
 */

export type QuoteTemplate = "classic" | "modern";

export const QUOTE_TEMPLATE_LABELS: Record<QuoteTemplate, string> = {
  classic: "Clássico",
  modern: "Moderno",
};

export interface QuoteStyle {
  template: QuoteTemplate;
  /** Cor da marca em #rrggbb minúsculo. */
  brandColor: string;
  /** Texto de apresentação; {cliente} vira o nome do cliente. null = sem texto. */
  introText: string | null;
  /** Chave Pix da empresa, já normalizada (ver pix.ts); null = sem Pix no PDF. */
  pixKey: string | null;
  /** Nome do recebedor do Pix; vazio = nome da empresa. */
  pixName: string | null;
  /** Mostra o bloco de aceite com linhas de assinatura. */
  showAcceptance: boolean;
}

export const DEFAULT_BRAND_COLOR = "#1f2937";
export const DEFAULT_INTRO_TEXT = "Olá, {cliente}! Agradecemos a oportunidade de apresentar esta proposta. Confira abaixo os itens, os valores e as condições.";
export const INTRO_TEXT_MAX = 600;

export const DEFAULT_QUOTE_STYLE: QuoteStyle = {
  template: "modern",
  brandColor: DEFAULT_BRAND_COLOR,
  introText: DEFAULT_INTRO_TEXT,
  pixKey: null,
  pixName: null,
  showAcceptance: true,
};

/** "#abc" ou "#AABBCC" (com ou sem #) → "#aabbcc"; qualquer outra coisa → null. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(text)) return `#${text.split("").map((c) => c + c).join("").toLowerCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
  return null;
}

/** Lê o JSON salvo no banco. Chave ausente = padrão; texto de apresentação "" salvo de propósito = sem texto. */
export function parseQuoteStyle(raw: unknown): QuoteStyle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_QUOTE_STYLE };
  const data = raw as Record<string, unknown>;
  const template: QuoteTemplate = data.template === "classic" || data.template === "modern" ? data.template : DEFAULT_QUOTE_STYLE.template;
  const intro = typeof data.intro_text === "string" ? data.intro_text.trim().slice(0, INTRO_TEXT_MAX) : undefined;
  const pixKey = typeof data.pix_key === "string" && data.pix_key.trim() !== "" ? data.pix_key.trim() : null;
  const pixName = typeof data.pix_name === "string" && data.pix_name.trim() !== "" ? data.pix_name.trim().slice(0, 25) : null;
  return {
    template,
    brandColor: normalizeHexColor(data.brand_color) ?? DEFAULT_BRAND_COLOR,
    introText: intro === undefined ? DEFAULT_INTRO_TEXT : intro === "" ? null : intro,
    pixKey,
    pixName,
    showAcceptance: typeof data.show_acceptance === "boolean" ? data.show_acceptance : true,
  };
}

/** Texto de apresentação com o nome do cliente (só o primeiro nome, para soar natural). */
export function applyIntro(text: string | null, customerName: string): string | null {
  if (!text) return null;
  const first = customerName.trim().split(/\s+/)[0] ?? "";
  const filled = text.replace(/\{cliente\}/gi, first || "cliente").trim();
  return filled === "" ? null : filled;
}

// ---------------------------------------------------------------- cores
const channels = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** Luminância relativa (WCAG), de 0 (preto) a 1 (branco). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste (WCAG) entre duas cores, de 1 a 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mistura a cor com branco (ratio 0..1 de branco). */
export function mixWithWhite(hex: string, ratio: number): string {
  const [r, g, b] = channels(hex);
  return toHex([r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio]);
}

function mixWithBlack(hex: string, ratio: number): string {
  const [r, g, b] = channels(hex);
  return toHex([r * (1 - ratio), g * (1 - ratio), b * (1 - ratio)]);
}

export interface QuotePalette {
  brand: string;
  /** Cor do texto sobre a cor da marca (branco ou quase preto, o que tiver mais contraste). */
  onBrand: string;
  /** A cor da marca usada como TEXTO sobre fundo branco: escurecida se a original for clara demais para ler. */
  brandText: string;
  /** Tom bem claro da marca, para fundos de cartões e linhas alternadas. */
  soft: string;
}

export function paletteOf(brandColor: string): QuotePalette {
  const brand = normalizeHexColor(brandColor) ?? DEFAULT_BRAND_COLOR;
  const onBrand = contrast(brand, "#ffffff") >= contrast(brand, "#111827") ? "#ffffff" : "#111827";
  let brandText = brand;
  for (let step = 0; step < 12 && contrast(brandText, "#ffffff") < 4.5; step += 1) brandText = mixWithBlack(brandText, 0.12);
  return { brand, onBrand, brandText, soft: mixWithWhite(brand, 0.9) };
}
