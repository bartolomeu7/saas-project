/**
 * Pix "copia e cola" / QR Code estático (BR Code, padrão do Banco Central) para o orçamento.
 * Função pura, sem rede e sem banco: a empresa só informa a chave Pix; o sistema monta o código com o valor do orçamento.
 * Não confirma pagamento (isso só um banco/PSP faz) — apenas facilita o cliente pagar o valor certo para a chave certa.
 */

export type PixKeyType = "cpf" | "cnpj" | "phone" | "email" | "random";

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Celular",
  email: "E-mail",
  random: "Chave aleatória",
};

export type PixKeyResult = { ok: true; key: string; type: PixKeyType } | { ok: false; error: string };

const digitsOf = (value: string): string => value.replace(/\D/g, "");

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(digits[i]) * (size + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(digits[size])) return false;
  }
  return true;
}

export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  for (const size of [12, 13]) {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(digits[i]) * (weights[i] ?? 0);
    const rest = sum % 11;
    const check = rest < 2 ? 0 : 11 - rest;
    if (check !== Number(digits[size])) return false;
  }
  return true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * Descobre o tipo da chave pelo que foi digitado e devolve a forma que vai no código Pix:
 * CPF/CNPJ só dígitos, celular "+55DDDNÚMERO", e-mail em minúsculas, aleatória (UUID) em minúsculas.
 * Em caso de dúvida entre CPF e celular (11 dígitos), vale CPF se os dígitos verificadores batem.
 */
export function normalizePixKey(raw: string): PixKeyResult {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: false, error: "Informe a chave Pix." };

  if (text.includes("@")) {
    const email = text.toLowerCase();
    if (email.length > 77 || !EMAIL.test(email)) return { ok: false, error: "E-mail da chave Pix inválido." };
    return { ok: true, key: email, type: "email" };
  }

  if (UUID.test(text)) return { ok: true, key: text.toLowerCase(), type: "random" };

  if (/[A-Za-z]/.test(text)) return { ok: false, error: "Chave Pix inválida. Use CPF, CNPJ, celular, e-mail ou chave aleatória." };

  const digits = digitsOf(text);
  const startsWithPlus = text.startsWith("+");

  if (!startsWithPlus && digits.length === 14) {
    return isValidCnpj(digits) ? { ok: true, key: digits, type: "cnpj" } : { ok: false, error: "CNPJ da chave Pix inválido." };
  }
  if (!startsWithPlus && digits.length === 11 && isValidCpf(digits)) return { ok: true, key: digits, type: "cpf" };
  // formato de CPF (000.000.000-00) que não passou na conferência não vira celular por engano
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(text)) return { ok: false, error: "CPF da chave Pix inválido." };

  // celular: com +55, com 55 na frente (12/13 dígitos) ou só DDD + número (10/11 dígitos)
  let phone: string | null = null;
  if (startsWithPlus && /^55\d{10,11}$/.test(digits)) phone = digits;
  else if (!startsWithPlus && /^55\d{10,11}$/.test(digits) && digits.length >= 12) phone = digits;
  else if (!startsWithPlus && /^\d{10,11}$/.test(digits)) phone = `55${digits}`;
  // chave Pix de telefone é sempre celular: DDD (2 dígitos) + 9 + 8 dígitos
  if (phone && /^55[1-9]\d9\d{8}$/.test(phone)) return { ok: true, key: `+${phone}`, type: "phone" };

  return { ok: false, error: "Chave Pix inválida. Use CPF, CNPJ, celular com DDD, e-mail ou chave aleatória." };
}

/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), exigido no fim do BR Code. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= (text.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nome e cidade do recebedor: o BR Code aceita só ASCII simples, em maiúsculas, com limite de tamanho. */
export function pixText(value: string | null | undefined, max: number, fallback: string): string {
  const ascii = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
  return ascii === "" ? fallback : ascii;
}

const field = (id: string, value: string): string => `${id}${String(value.length).padStart(2, "0")}${value}`;

export interface PixPayloadInput {
  key: string;
  receiverName: string;
  city: string;
  /** Valor em centavos; 0 ou ausente = o cliente digita o valor. */
  amountCents?: number;
  /** Identificador da cobrança (letras e números, até 25); ajuda a conciliar o recebimento no extrato. */
  txid?: string;
}

/** Monta o texto do Pix "copia e cola" (o mesmo conteúdo do QR Code) no padrão BR Code estático. */
export function buildPixPayload(input: PixPayloadInput): string {
  const txid = String(input.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const merchantAccount = field("00", "br.gov.bcb.pix") + field("01", input.key);
  const amount = input.amountCents && input.amountCents > 0 ? field("54", (input.amountCents / 100).toFixed(2)) : "";
  const body =
    field("00", "01") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986") +
    amount +
    field("58", "BR") +
    field("59", pixText(input.receiverName, 25, "RECEBEDOR")) +
    field("60", pixText(input.city, 15, "BRASIL")) +
    field("62", field("05", txid)) +
    "6304";
  return body + crc16(body);
}
