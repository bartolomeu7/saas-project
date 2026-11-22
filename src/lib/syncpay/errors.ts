/**
 * Texto curto e seguro para registrar POR QUE a SyncPay recusou uma chamada (log do servidor e observações do pagamento,
 * visíveis no painel admin). Módulo puro, testado em Node.
 *
 * A mensagem do provedor costuma ser técnica e útil para quem opera ("Permission 'pix_enabled' is not granted for this
 * user."), mas pode, em tese, repetir um valor enviado: por isso sequências longas de dígitos (CPF/CNPJ, telefone, cartão) e
 * e-mails são mascarados, caracteres de controle saem e o tamanho é limitado. Nunca recebe o corpo da requisição.
 */
export const MAX_PROVIDER_NOTE = 220;

export function safeProviderMessage(message: unknown): string {
  const text = typeof message === "string" ? message : "";
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g, "[e-mail]")
    .replace(/\d[\d.\-/\s]{6,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROVIDER_NOTE);
}

/** Linha para `subscription_payments.notes`: "Provedor recusou (HTTP 500): <mensagem>". Status 0 = sem resposta (rede/tempo). */
export function providerFailureNote(status: number, message: unknown): string {
  const reason = safeProviderMessage(message);
  const head = status > 0 ? `Provedor recusou (HTTP ${status})` : "Sem resposta do provedor (rede ou tempo esgotado)";
  return reason ? `${head}: ${reason}` : `${head}.`;
}
