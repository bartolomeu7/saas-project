/**
 * Dados que a SyncPay exige do comprador e que o checkout pede quando faltam: CPF/CNPJ válido e telefone com DDD.
 * Módulo puro (sem banco/rede), testado em Node. A gravação é feita pela ação `saveBillingProfileAction`.
 */
import { cnpjIsValid, cpfIsValid } from "../validations/document.ts";
import { normalizeBrPhone } from "./buyer.ts";

const digits = (value: string | null | undefined): string => String(value ?? "").replace(/\D/g, "");

/** CPF 000.000.000-00 / CNPJ 00.000.000/0000-00; outro tamanho volta como veio. */
export function formatDocument(raw: string | null | undefined): string {
  const d = digits(raw);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return String(raw ?? "").trim();
}

/** (11) 99999-8888 ou (11) 3333-4444; fora disso volta como veio. */
export function formatPhone(raw: string | null | undefined): string {
  const d = normalizeBrPhone(raw);
  if (!d) return String(raw ?? "").trim();
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

export function documentProblem(raw: string | null | undefined): string | null {
  const d = digits(raw);
  if (d.length === 0) return "Informe o CPF ou CNPJ.";
  if (d.length === 11) return cpfIsValid(d) ? null : "CPF inválido. Confira os números.";
  if (d.length === 14) return cnpjIsValid(d) ? null : "CNPJ inválido. Confira os números.";
  return "Informe um CPF (11 números) ou CNPJ (14 números).";
}

export function phoneProblem(raw: string | null | undefined): string | null {
  if (digits(raw).length === 0) return "Informe o telefone com DDD.";
  return normalizeBrPhone(raw) ? null : "Telefone inválido. Use o DDD e o número, ex.: (11) 99999-8888.";
}

export interface BillingProfileInput {
  /** undefined = não alterar (o dado atual da empresa já serve). */
  document?: string;
  phone?: string;
}

export type BillingProfileCheck =
  | { ok: true; document?: string; phone?: string }
  | { ok: false; errors: { document?: string; phone?: string } };

/** Confere SÓ os campos enviados e devolve já formatados para gravar. */
export function checkBillingProfile(input: BillingProfileInput): BillingProfileCheck {
  const errors: { document?: string; phone?: string } = {};
  let document: string | undefined;
  let phone: string | undefined;

  if (input.document !== undefined) {
    const problem = documentProblem(input.document);
    if (problem) errors.document = problem;
    else document = formatDocument(input.document);
  }
  if (input.phone !== undefined) {
    const problem = phoneProblem(input.phone);
    if (problem) errors.phone = problem;
    else phone = formatPhone(input.phone);
  }

  if (errors.document || errors.phone) return { ok: false, errors };
  return { ok: true, document, phone };
}
