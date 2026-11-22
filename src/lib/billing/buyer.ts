/**
 * Dados do comprador exigidos pela SyncPay (Pix e cartão): nome, CPF/CNPJ válido (a API confere o dígito verificador),
 * e-mail e telefone com DDD. Saem do cadastro da empresa e do usuário logado — nunca do navegador no momento do pagamento.
 * Módulo puro (sem banco/rede), testado em Node.
 */
import { cnpjIsValid, cpfIsValid } from "../validations/document.ts";

export interface BuyerSource {
  companyName: string | null | undefined;
  legalName: string | null | undefined;
  document: string | null | undefined;
  phone: string | null | undefined;
  whatsapp: string | null | undefined;
  companyEmail: string | null | undefined;
  userEmail: string | null | undefined;
}

export interface BuyerData {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export type MissingField = "documento" | "telefone" | "e-mail" | "nome";

export type BuyerResult = { ok: true; buyer: BuyerData } | { ok: false; missing: MissingField[] };

const digits = (value: string | null | undefined): string => String(value ?? "").replace(/\D/g, "");
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** Telefone da API: só dígitos com DDD (10 ou 11), SEM o 55 e sem formatação. */
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  let d = digits(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  if (!/^[1-9][1-9]/.test(d)) return null;
  return d;
}

export function buildBuyer(source: BuyerSource): BuyerResult {
  const missing: MissingField[] = [];

  const name = (source.legalName?.trim() || source.companyName?.trim() || "").slice(0, 120);
  if (!name) missing.push("nome");

  const doc = digits(source.document);
  const documentOk = (doc.length === 11 && cpfIsValid(doc)) || (doc.length === 14 && cnpjIsValid(doc));
  if (!documentOk) missing.push("documento");

  const phone = normalizeBrPhone(source.whatsapp) ?? normalizeBrPhone(source.phone);
  if (!phone) missing.push("telefone");

  const email = [source.companyEmail, source.userEmail].map((v) => (v ?? "").trim().toLowerCase()).find((v) => v !== "" && v.length <= 120 && EMAIL.test(v));
  if (!email) missing.push("e-mail");

  if (missing.length > 0 || !phone || !email) return { ok: false, missing };
  return { ok: true, buyer: { name, document: doc, email, phone } };
}

/** Mensagem para o usuário quando faltam dados do cadastro (sem expor nada além do nome do campo). */
export function incompleteProfileMessage(missing: MissingField[]): string {
  const list = missing.join(", ");
  return `Para pagar, complete o cadastro da empresa em Configurações → Empresa (faltam: ${list}). O pagamento exige CPF/CNPJ válido e telefone.`;
}

/** Origem (esquema + host) do site, sem caminho nem barra final — formato exigido pelo `parent_origin` do iFrame da SyncPay. */
export function siteOrigin(siteUrl: string): string | null {
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** URL do iFrame de pagamento da SyncPay. O valor vem SEMPRE do pagamento salvo no banco (em centavos, 100 a 99999999). */
export function buildCardIframeUrl(input: { publicKey: string; amountReais: number; parentOrigin: string }): string | null {
  const cents = Math.round(input.amountReais * 100);
  if (!Number.isInteger(cents) || cents < 100 || cents > 99_999_999) return null;
  if (!/^pk_live_[A-Za-z0-9_-]+$/.test(input.publicKey)) return null;
  const params = new URLSearchParams({ amount: String(cents), parent_origin: input.parentOrigin });
  return `https://app.syncpayments.com.br/embed/${input.publicKey}?${params.toString()}`;
}

/** O token do iFrame precisa vir no formato documentado: `card_token.` + conteúdo opaco, de tamanho razoável. */
export function isCardToken(value: unknown): value is string {
  return typeof value === "string" && /^card_token\.[A-Za-z0-9._~+/=-]{8,2000}$/.test(value);
}
