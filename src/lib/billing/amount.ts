/**
 * Comparação de valores monetários do billing. Sempre em centavos inteiros (nunca float):
 * "89", 89, "89.00" e 89.0 são o mesmo valor; 88.99 e 89.01 não são. Valores ausentes,
 * não numéricos, negativos ou infinitos viram `null` (ambíguo => quem chama deve rejeitar).
 */
export function toCents(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null; // Number("") === 0: vazio/espaços NÃO podem virar "0 centavo"
    n = Number(text.replace(",", "."));
  } else {
    return null; // null, undefined, objetos, arrays, booleanos...
  }
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** true somente se os dois valores existem e são iguais ao centavo. */
export function amountsMatch(expected: unknown, actual: unknown): boolean {
  const a = toCents(expected);
  const b = toCents(actual);
  return a !== null && b !== null && a === b;
}

/** Mensagens (sem dados sensíveis) para cada motivo de rejeição devolvido por confirm_subscription_payment. */
export const CONFIRMATION_REJECTION_MESSAGES: Record<string, string> = {
  AMOUNT_MISMATCH: "O valor confirmado pelo provedor é diferente do valor da cobrança.",
  AMOUNT_MISSING: "O provedor não informou o valor pago; a confirmação foi recusada.",
  NO_PROVIDER_CHARGE: "A cobrança ainda não existe no provedor.",
  PLAN_NOT_BILLABLE: "O plano desta cobrança não tem duração fixa.",
  EVENT_PAYMENT_MISMATCH: "O evento de pagamento pertence a outra cobrança.",
  REFUNDED_TERMINAL: "A cobrança já foi estornada e não pode voltar a ser paga.",
};

export function rejectionMessage(code: string | null | undefined): string {
  return (code && CONFIRMATION_REJECTION_MESSAGES[code]) || "A confirmação do pagamento foi recusada.";
}
