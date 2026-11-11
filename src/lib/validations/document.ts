/**
 * Documento (CPF/CNPJ) e telefone. O campo "Documento" é livre (aceita RG, passaporte etc.), então só
 * conferimos o dígito verificador quando o valor TEM cara de CPF (11 dígitos) ou CNPJ (14 dígitos).
 */

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function cpfIsValid(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(digits[length])) return false;
  }
  return true;
}

function cnpjIsValid(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  for (const length of [12, 13]) {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * weights[i]!;
    const mod = sum % 11;
    const check = mod < 2 ? 0 : 11 - mod;
    if (check !== Number(digits[length])) return false;
  }
  return true;
}

/** Mensagem de erro, ou null se o documento está ok (vazio e formatos que não são CPF/CNPJ passam). */
export function documentError(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const digits = onlyDigits(value);
  const looksNumeric = /^[\d.\-/\s]+$/.test(value);
  if (!looksNumeric) return null;
  if (digits.length === 11) return cpfIsValid(digits) ? null : "CPF inválido. Confira os números.";
  if (digits.length === 14) return cnpjIsValid(digits) ? null : "CNPJ inválido. Confira os números.";
  return null;
}

/** Formas em que o mesmo CPF/CNPJ pode estar gravado (com e sem pontuação), para achar duplicados. */
export function documentVariants(raw: string): string[] {
  const value = raw.trim();
  const digits = onlyDigits(value);
  const variants = new Set<string>([value]);
  if (digits.length === 11) {
    variants.add(digits);
    variants.add(`${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`);
  } else if (digits.length === 14) {
    variants.add(digits);
    variants.add(`${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`);
  }
  return [...variants];
}

/** Telefone: só dígitos, espaço e ( ) + -, com 8 a 15 dígitos. Vazio passa (campo opcional). */
export function phoneError(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!/^[\d\s()+\-.]+$/.test(value)) return "Telefone inválido: use só números, espaços e ( ) + -.";
  const digits = onlyDigits(value).length;
  if (digits < 8 || digits > 15) return "Telefone inválido: informe de 8 a 15 dígitos.";
  return null;
}
