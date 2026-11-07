/**
 * Telefone para o Clerk, que exige o formato internacional (E.164, ex.: +5511999998888).
 *
 * Função pura para poder ser testada em Node. Quem digita só o número brasileiro (com ou sem DDD formatado) recebe o
 * +55 automaticamente; números que já começam com "+" são mantidos. Devolve null quando o número não parece válido —
 * a validação final continua sendo do Clerk.
 */
export function normalizePhoneInput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const hasPlus = text.startsWith("+");
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // E.164: no máximo 15 dígitos, no mínimo 8 (código do país + número).
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // Brasil: DDD (2) + 8 ou 9 dígitos. Aceita também o prefixo 55 digitado sem "+".
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return null;
}

/** Máscara de exibição: +55 (11) 99999-8888. Formatos desconhecidos voltam como estão. */
export function formatPhoneDisplay(e164: string): string {
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : e164;
}
