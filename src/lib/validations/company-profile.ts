import { z } from "zod";
import { documentError, phoneError } from "./document.ts";
import { cleanText, collapseSpaces } from "./common.ts";
import { BRAZIL_UFS } from "./brazil-ufs.ts";

/**
 * Dados cadastrais da empresa (Orçamento, Fase 0). Tudo é opcional, mas o que for preenchido precisa estar certo:
 * o PDF do orçamento mostra estes dados ao cliente final. Os limites acompanham a migration 20261121100000.
 */

const field = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => collapseSpaces(cleanText(value ?? "")).trim())
    .pipe(z.string().max(max, `Máximo de ${max} caracteres.`));

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) com a pontuação padrão; outro formato volta como está. */
export function formatCompanyDocument(value: string): string {
  const digits = digitsOf(value);
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  return value;
}

export function formatPostalCode(value: string): string {
  const digits = digitsOf(value);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

/** Site: aceita "empresa.com.br" (acrescenta https://) e recusa qualquer protocolo que não seja http/https. */
export function normalizeWebsite(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") || /\s/.test(text)) return null;
    return withScheme.length <= 160 ? withScheme : null;
  } catch {
    return null;
  }
}

export const companyProfileSchema = z.object({
  legalName: field(180),
  document: field(32).superRefine((value, ctx) => {
    if (!value) return;
    const digits = digitsOf(value);
    if (digits.length !== 11 && digits.length !== 14) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um CPF (11 números) ou CNPJ (14 números)." });
      return;
    }
    const problem = documentError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  phone: field(32).superRefine((value, ctx) => {
    const problem = phoneError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  whatsapp: field(32).superRefine((value, ctx) => {
    const problem = phoneError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WhatsApp: " + problem.charAt(0).toLowerCase() + problem.slice(1) });
  }),
  email: field(160)
    .transform((value) => value.toLowerCase())
    .refine((value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), { message: "Informe um e-mail válido." }),
  website: field(160).superRefine((value, ctx) => {
    if (value && normalizeWebsite(value) === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um site válido (ex.: www.suaempresa.com.br)." });
    }
  }),
  postalCode: field(16).refine((value) => value === "" || digitsOf(value).length === 8, { message: "CEP inválido: use 8 números." }),
  address: field(200),
  addressNumber: field(20).refine((value) => !value.startsWith("-"), { message: "Número do endereço inválido." }),
  complement: field(100),
  neighborhood: field(100),
  city: field(100).refine((value) => value === "" || /\p{L}/u.test(value), { message: "Informe uma cidade válida (com letras)." }),
  state: field(2)
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || (BRAZIL_UFS as readonly string[]).includes(value), { message: "UF inválida (use a sigla, ex.: SP)." }),
});
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

/** Valores prontos para gravar: documento e CEP com a pontuação padrão, site com protocolo. */
export function normalizeCompanyProfile(input: CompanyProfileInput): CompanyProfileInput {
  return {
    ...input,
    document: formatCompanyDocument(input.document),
    postalCode: formatPostalCode(input.postalCode),
    website: input.website ? (normalizeWebsite(input.website) ?? input.website) : "",
  };
}

/** Padrões do orçamento: validade, condições de pagamento e rodapé do PDF. */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 15;

export const quoteDefaultsSchema = z.object({
  validityDays: z.coerce
    .number({ invalid_type_error: "Informe a validade em dias." })
    .int("A validade deve ser em dias inteiros.")
    .min(1, "A validade deve ser de 1 a 365 dias.")
    .max(365, "A validade deve ser de 1 a 365 dias."),
  paymentTerms: z
    .string()
    .nullish()
    .transform((value) => cleanText(value ?? "").trim())
    .pipe(z.string().max(1000, "Condições de pagamento: máximo de 1000 caracteres.")),
  footer: field(300),
});
export type QuoteDefaultsInput = z.infer<typeof quoteDefaultsSchema>;
