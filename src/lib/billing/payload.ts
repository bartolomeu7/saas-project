/**
 * Minimização de dados pessoais (LGPD): o que vai para `payment_events.payload`.
 *
 * A resposta do GET /pix?id= da EvoPay traz dados do pagador (payerName, payerDocument) e o QR Code. Nada disso é
 * necessário para auditar um evento financeiro. Guardamos só: identificador da transação, status, valor, taxas,
 * identificador Pix fim a fim (sem dado pessoal) e carimbos de tempo. Módulo puro: testado sem rede.
 */
export interface ProviderTransactionLike {
  id: string;
  status: string;
  amount?: unknown;
  taxAmount?: unknown;
  amountWithTax?: unknown;
  endToEndId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function minimizeProviderPayload(transaction: ProviderTransactionLike): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
  };
  if (transaction.taxAmount !== undefined && transaction.taxAmount !== null) payload.taxAmount = transaction.taxAmount;
  if (transaction.amountWithTax !== undefined && transaction.amountWithTax !== null) payload.amountWithTax = transaction.amountWithTax;
  if (transaction.endToEndId) payload.endToEndId = transaction.endToEndId;
  if (transaction.createdAt) payload.createdAt = transaction.createdAt;
  if (transaction.updatedAt) payload.updatedAt = transaction.updatedAt;
  return payload;
}
