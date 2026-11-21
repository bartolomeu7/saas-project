/**
 * Regras puras do Orçamento (sem banco, sem React): situações, totais em centavos e texto seguro para o PDF.
 * Importável por testes de Node: só imports relativos com ".ts".
 * O banco recalcula e confere tudo de novo (funções create_quote/update_quote); aqui é para a tela mostrar o mesmo número
 * e para recusar cedo o que o banco recusaria.
 */

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "converted";
/** Situação mostrada: "expired" (vencido) é CALCULADO, nunca gravado. */
export type QuoteDisplayStatus = QuoteStatus | "expired";
export type QuoteItemType = "product" | "service" | "custom";

export const QUOTE_STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Vencido",
  converted: "Convertido em venda",
};

export const MAX_QUOTE_ITEMS = 100;
export const MAX_ITEM_DESCRIPTION = 300;
export const MAX_QUOTE_MONEY_CENTS = 99_999_999_999; // R$ 999.999.999,99
const MAX_QUANTITY_MILLI = 999_999_999_999; // 999.999.999,999

/** Enviado com validade já passada = vencido (a validade vale até o fim do dia indicado). */
export function displayStatus(status: QuoteStatus, validUntil: string, today: string): QuoteDisplayStatus {
  if (status === "sent" && validUntil < today) return "expired";
  return status;
}

export const canEditQuote = (status: QuoteStatus): boolean => status === "draft";
export const canDeleteQuote = (status: QuoteStatus): boolean => status === "draft";

/** Quais mudanças de situação o banco aceita (set_quote_status). Aprovar exige validade em dia. */
export function allowedTransitions(status: QuoteStatus, validUntil: string, today: string): Array<"sent" | "approved" | "rejected" | "draft"> {
  const expired = validUntil < today;
  switch (status) {
    case "draft":
      return expired ? [] : ["sent"];
    case "sent":
      return expired ? ["rejected", "draft"] : ["approved", "rejected", "draft"];
    case "rejected":
      return ["draft"];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- números (centavos e milésimos, nunca float)

/**
 * Número digitado no formato brasileiro ou com ponto ("1.234,56", "1234.56", "10,5") → texto com ponto ("1234.56").
 * Com vírgula, os pontos são milhar. Sem vírgula, o ponto é decimal ("2.5" = 2,5), exceto padrão de milhar claro ("1.234.567").
 * Devolve null se não for um número positivo/zero válido ou tiver casas demais.
 */
export function normalizeDecimal(input: string, maxDecimals: number): string | null {
  let text = String(input ?? "").trim().replace(/\s+/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3}){2,}$/.test(text)) text = text.replace(/\./g, "");
  if (!/^\d{1,12}(\.\d+)?$/.test(text)) return null;
  const decimals = text.split(".")[1]?.length ?? 0;
  if (decimals > maxDecimals) return null;
  return text;
}

const toScaled = (text: string, decimals: number): number => {
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 10 ** decimals + Number(frac.padEnd(decimals, "0") || 0);
};

export const toCents = (text: string): number => toScaled(text, 2);
export const toMilli = (text: string): number => toScaled(text, 3);

/** quantidade (milésimos) × preço (centavos) → centavos, arredondado como o banco (round(qty*price, 2), meio para cima). */
export function lineGrossCents(quantityMilli: number, unitPriceCents: number): number {
  // quantidade e preço são inteiros pequenos o bastante para o produto caber em BigInt sem perder precisão
  const product = BigInt(quantityMilli) * BigInt(unitPriceCents); // centavos × 1000
  return Number((product + 500n) / 1000n);
}

export const formatCents = (cents: number): string =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatQuantity = (quantityMilli: number): string =>
  (quantityMilli / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

// ---------------------------------------------------------------- itens vindos do formulário

export interface QuoteItemInput {
  item_type: QuoteItemType;
  product_id?: string | null;
  service_id?: string | null;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
}

export interface QuoteTotals {
  lines: Array<{ grossCents: number; discountCents: number; totalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export type ItemsResult = { ok: true; items: QuoteItemInput[]; lines: QuoteTotals["lines"] } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Remove caracteres de controle e de direção invisível (mesma lista de validations/common.ts, sem depender do zod). */
export function cleanLine(value: string): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Confere o que veio do formulário (JSON de itens) e normaliza para o formato da função do banco.
 * Mensagens em português, citando o número do item.
 */
export function parseQuoteItems(raw: unknown): ItemsResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Adicione pelo menos um item ao orçamento." };
  if (raw.length > MAX_QUOTE_ITEMS) return { ok: false, error: `Um orçamento pode ter no máximo ${MAX_QUOTE_ITEMS} itens.` };
  const items: QuoteItemInput[] = [];
  const lines: QuoteTotals["lines"] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const n = index + 1;
    const row = raw[index] as Record<string, unknown> | null;
    if (!row || typeof row !== "object") return { ok: false, error: `Item ${n} inválido.` };
    const type = String(row.item_type ?? "custom") as QuoteItemType;
    if (type !== "product" && type !== "service" && type !== "custom") return { ok: false, error: `Tipo do item ${n} inválido.` };
    const productId = type === "product" ? String(row.product_id ?? "") : "";
    const serviceId = type === "service" ? String(row.service_id ?? "") : "";
    if (type === "product" && !UUID.test(productId)) return { ok: false, error: `Escolha o produto do item ${n}.` };
    if (type === "service" && !UUID.test(serviceId)) return { ok: false, error: `Escolha o serviço do item ${n}.` };
    const description = cleanLine(String(row.description ?? ""));
    if (!description) return { ok: false, error: `Descreva o item ${n}.` };
    if (description.length > MAX_ITEM_DESCRIPTION) return { ok: false, error: `A descrição do item ${n} pode ter no máximo ${MAX_ITEM_DESCRIPTION} caracteres.` };
    const unit = cleanLine(String(row.unit ?? "")) || (type === "service" ? "serv" : "un");
    if (unit.length > 12) return { ok: false, error: `A unidade do item ${n} pode ter no máximo 12 caracteres.` };

    const quantity = normalizeDecimal(String(row.quantity ?? ""), 3);
    if (quantity === null || toMilli(quantity) <= 0) return { ok: false, error: `Informe uma quantidade válida no item ${n} (até 3 casas decimais).` };
    if (toMilli(quantity) > MAX_QUANTITY_MILLI) return { ok: false, error: `A quantidade do item ${n} é grande demais.` };
    const price = normalizeDecimal(String(row.unit_price ?? ""), 2);
    if (price === null) return { ok: false, error: `Informe um preço válido no item ${n} (até 2 casas decimais).` };
    if (toCents(price) > MAX_QUOTE_MONEY_CENTS) return { ok: false, error: `O preço do item ${n} é alto demais.` };
    const discountText = String(row.discount_amount ?? "").trim() === "" ? "0" : String(row.discount_amount);
    const discount = normalizeDecimal(discountText, 2);
    if (discount === null) return { ok: false, error: `O desconto do item ${n} é inválido.` };

    const gross = lineGrossCents(toMilli(quantity), toCents(price));
    if (gross > MAX_QUOTE_MONEY_CENTS) return { ok: false, error: `O total do item ${n} passa do limite permitido (R$ 999.999.999,99).` };
    const discountCents = toCents(discount);
    if (discountCents > gross) return { ok: false, error: `O desconto do item ${n} não pode ser maior que o valor do item.` };

    items.push({
      item_type: type,
      product_id: productId || null,
      service_id: serviceId || null,
      description,
      unit,
      quantity,
      unit_price: price,
      discount_amount: discount,
    });
    lines.push({ grossCents: gross, discountCents, totalCents: gross - discountCents });
  }
  return { ok: true, items, lines };
}

/** Subtotal, desconto geral e total (mesma conta do banco). Erro em texto se o desconto geral não couber. */
export function computeTotals(lines: QuoteTotals["lines"], generalDiscountText: string): { ok: true; totals: QuoteTotals } | { ok: false; error: string } {
  const discountText = String(generalDiscountText ?? "").trim() === "" ? "0" : generalDiscountText;
  const discount = normalizeDecimal(discountText, 2);
  if (discount === null) return { ok: false, error: "O desconto geral é inválido." };
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  if (subtotalCents > MAX_QUOTE_MONEY_CENTS) return { ok: false, error: "O total do orçamento passa do limite permitido (R$ 999.999.999,99)." };
  const discountCents = toCents(discount);
  if (discountCents > subtotalCents) return { ok: false, error: "O desconto geral não pode ser maior que o subtotal." };
  return { ok: true, totals: { lines, subtotalCents, discountCents, totalCents: subtotalCents - discountCents } };
}

// ---------------------------------------------------------------- datas

/** "AAAA-MM-DD" válida de verdade (31/02 não existe). */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function daysBetweenIso(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ---------------------------------------------------------------- PDF

/**
 * A fonte padrão do PDF (Helvetica) só tem o alfabeto latino do Windows-1252: emoji, setas, CJK etc. viram quadradinho
 * ou quebram a página. Troca por equivalente simples ou remove, mantendo acentos, "R$", travessões e aspas curvas.
 */
export function pdfSafeText(value: string): string {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→|⇒/g, "->")
    .replace(/✓|✔/g, "ok")
    .replace(/[•●▪]/g, "-")
    .replace(/ /g, " ");
  let out = "";
  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || char === "\t") out += char === "\t" ? " " : char;
    else if (code >= 0x20 && code <= 0x7e) out += char;
    else if (code >= 0xa1 && code <= 0xff) out += char; // Latin-1 (acentos, ª, º, €? não: € é 0x20AC)
    else if (code === 0x20ac || code === 0x2013 || code === 0x2014 || code === 0x2026) out += char === "€" ? "EUR" : char === "…" ? "..." : "-";
    // todo o resto (emoji, símbolos, CJK, controle) é descartado
  }
  return out.replace(/[^\S\n]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Nome do arquivo PDF: "Orcamento ORC-2026-0001 - Fulano de Tal.pdf" sem caracteres que o Windows/navegador recusam. */
export function quoteFileName(number: string, customerName: string): string {
  const safeName = pdfSafeText(customerName)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const safeNumber = number.replace(/[^A-Za-z0-9-]/g, "");
  return `Orcamento ${safeNumber}${safeName ? ` - ${safeName}` : ""}.pdf`;
}
