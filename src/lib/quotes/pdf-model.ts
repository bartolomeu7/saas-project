/**
 * Dados do PDF do orçamento já prontos para desenhar: textos formatados, filtrados para a fonte do PDF e sem campos vazios.
 * Função pura (sem React, sem banco): quem desenha (pdf-document.ts) só posiciona; é aqui que se testa o conteúdo.
 */
import { formatCents, formatQuantity, pdfSafeText, toCents, toMilli, QUOTE_STATUS_LABELS, type QuoteStatus } from "./rules.ts";
import { PIX_KEY_TYPE_LABELS, buildPixPayload, normalizePixKey, pixText } from "./pix.ts";
import { DEFAULT_QUOTE_STYLE, applyIntro, paletteOf, type QuotePalette, type QuoteStyle, type QuoteTemplate } from "./style.ts";

export interface PdfCompanyInput {
  name: string;
  legal_name?: string | null;
  document?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  postal_code?: string | null;
  address?: string | null;
  address_number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface PdfQuoteInput {
  number: string;
  status: QuoteStatus;
  customer_name: string;
  customer_document: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  title: string | null;
  issued_on: string;
  valid_until: string;
  subtotal: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  payment_terms: string | null;
  delivery_terms: string | null;
  notes: string | null;
  footer: string | null;
}

export interface PdfItemInput {
  position: number;
  description: string;
  unit: string;
  quantity: number | string;
  unit_price: number | string;
  discount_amount: number | string;
  total_amount: number | string;
}

export interface QuotePdfModel {
  company: { name: string; legalName: string | null; document: string | null; address: string | null; contacts: string[] };
  number: string;
  isDraft: boolean;
  statusLabel: string;
  title: string | null;
  issuedOn: string;
  validUntil: string;
  customer: { name: string; lines: string[] };
  items: Array<{ position: string; description: string; quantity: string; unit: string; unitPrice: string; discount: string; total: string }>;
  hasItemDiscount: boolean;
  totals: { subtotal: string; discount: string | null; total: string };
  sections: Array<{ title: string; text: string }>;
  footer: string | null;
  /** Aparência e extras (modelo, cor, apresentação, Pix, aceite). */
  template: QuoteTemplate;
  palette: QuotePalette;
  intro: string | null;
  pix: { payload: string; receiver: string; keyLabel: string; key: string; amount: string } | null;
  acceptance: { customerName: string; companyName: string } | null;
}

const clean = (value: string | null | undefined): string | null => {
  const text = pdfSafeText(value ?? "");
  return text === "" ? null : text;
};

/** "AAAA-MM-DD" → "DD/MM/AAAA" sem passar por Date (sem deslocar o dia por fuso). */
export function isoToBr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** Valores do banco chegam como número ou texto; vira texto decimal com ponto e, daí, centavos exatos. */
const centsOf = (value: number | string): number => toCents(Number(value).toFixed(2));
const milliOf = (value: number | string): number => toMilli(Number(value).toFixed(3));

export function buildQuotePdfModel(company: PdfCompanyInput, quote: PdfQuoteInput, items: PdfItemInput[], style: QuoteStyle = DEFAULT_QUOTE_STYLE): QuotePdfModel {
  const street = [clean(company.address), clean(company.address_number), clean(company.complement)].filter(Boolean).join(", ");
  const place = [clean(company.neighborhood), [clean(company.city), clean(company.state)].filter(Boolean).join("/")].filter(Boolean).join(" - ");
  const cep = clean(company.postal_code);
  const address = [street, place, cep ? `CEP ${cep}` : ""].filter(Boolean).join(" - ") || null;
  const phone = clean(company.phone);
  const whatsapp = clean(company.whatsapp);
  const contacts = [
    phone ? `Tel. ${phone}` : null,
    whatsapp && whatsapp !== phone ? `WhatsApp ${whatsapp}` : null,
    clean(company.email),
    clean(company.website),
  ].filter((entry): entry is string => Boolean(entry));

  const customerLines = [
    clean(quote.customer_document) ? `CPF/CNPJ: ${clean(quote.customer_document)}` : null,
    clean(quote.customer_phone) ? `Telefone: ${clean(quote.customer_phone)}` : null,
    clean(quote.customer_email) ? `E-mail: ${clean(quote.customer_email)}` : null,
    clean(quote.customer_address) ? `Endereço: ${clean(quote.customer_address)}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  const rows = items.map((item) => {
    const discountCents = centsOf(item.discount_amount);
    return {
      position: String(item.position),
      description: clean(item.description) ?? "-",
      quantity: formatQuantity(milliOf(item.quantity)),
      unit: clean(item.unit) ?? "un",
      unitPrice: formatCents(centsOf(item.unit_price)),
      discount: discountCents > 0 ? formatCents(discountCents) : "-",
      total: formatCents(centsOf(item.total_amount)),
      discountCents,
    };
  });

  const generalDiscount = centsOf(quote.discount_amount);
  const totalCents = centsOf(quote.total_amount);
  const companyName = clean(company.name) ?? "Empresa";
  const customerName = clean(quote.customer_name) ?? "Cliente";

  // Pix: só entra com chave válida e valor maior que zero; o valor e o número do orçamento já vão dentro do código
  let pix: QuotePdfModel["pix"] = null;
  const pixKey = style.pixKey ? normalizePixKey(style.pixKey) : null;
  if (pixKey && pixKey.ok && totalCents > 0) {
    const receiver = pixText(style.pixName ?? companyName, 25, "RECEBEDOR");
    pix = {
      payload: buildPixPayload({ key: pixKey.key, receiverName: receiver, city: pixText(company.city, 15, "BRASIL"), amountCents: totalCents, txid: quote.number }),
      receiver,
      keyLabel: PIX_KEY_TYPE_LABELS[pixKey.type],
      key: pixKey.key,
      amount: formatCents(totalCents),
    };
  }
  const sections = [
    { title: "Condições de pagamento", text: clean(quote.payment_terms) },
    { title: "Prazo de entrega / execução", text: clean(quote.delivery_terms) },
    { title: "Observações", text: clean(quote.notes) },
  ].filter((section): section is { title: string; text: string } => section.text !== null);

  return {
    company: { name: companyName, legalName: clean(company.legal_name), document: clean(company.document), address, contacts },
    number: quote.number,
    isDraft: quote.status === "draft",
    statusLabel: QUOTE_STATUS_LABELS[quote.status],
    title: clean(quote.title),
    issuedOn: isoToBr(quote.issued_on),
    validUntil: isoToBr(quote.valid_until),
    customer: { name: customerName, lines: customerLines },
    items: rows.map(({ discountCents: _ignored, ...row }) => row),
    hasItemDiscount: rows.some((row) => row.discountCents > 0),
    totals: {
      subtotal: formatCents(centsOf(quote.subtotal)),
      discount: generalDiscount > 0 ? formatCents(generalDiscount) : null,
      total: formatCents(totalCents),
    },
    sections,
    footer: clean(quote.footer),
    template: style.template,
    palette: paletteOf(style.brandColor),
    intro: applyIntro(clean(style.introText), customerName),
    pix,
    acceptance: style.showAcceptance ? { customerName, companyName } : null,
  };
}
