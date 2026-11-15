import { findPhoneNumbersInText, parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Chat AI — telefone do Brasil (biblioteca libphonenumber-js, versão "min": só regras do país necessárias, sem rede).
 * "11 99999-0000", "(11)99999-0000", "011 99999 0000" e "+55 11 99999-0000" viram o mesmo número (+5511999990000).
 * Final de telefone ("final 7777") NÃO é número completo: continua sendo tratado à parte, por sufixo.
 */

export interface BrPhone {
  /** formato internacional sem espaços: +5511999990000 */
  e164: string;
  /** só os dígitos, sem o 55 */
  national: string;
}

/** Normaliza um telefone brasileiro (celular ou fixo). null se não for número válido. */
export function normalizePhoneBr(raw: string | null | undefined): BrPhone | null {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(String(raw), "BR");
  if (!parsed || !parsed.isValid() || parsed.country !== "BR") return null;
  return { e164: parsed.number, national: parsed.nationalNumber };
}

/** O mesmo número, mesmo escrito de jeitos diferentes? */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizePhoneBr(a);
  const y = normalizePhoneBr(b);
  return !!x && !!y && x.e164 === y.e164;
}

/** Telefones completos e válidos que aparecem no texto, na ordem. */
export function findPhonesInText(text: string): BrPhone[] {
  const out: BrPhone[] = [];
  for (const m of findPhoneNumbersInText(String(text), "BR")) {
    if (m.number.isValid() && m.number.country === "BR" && !out.some((p) => p.e164 === m.number.number)) out.push({ e164: m.number.number, national: m.number.nationalNumber });
  }
  return out;
}
