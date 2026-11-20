/** Texto das movimentações de estoque em português (o banco guarda os códigos em inglês). Código novo aparece como está. */
export const STOCK_SOURCE_LABELS: Record<string, string> = {
  opening: "Saldo inicial",
  manual: "Ajuste manual",
  sale: "Venda",
  sale_cancellation: "Venda cancelada",
  purchase: "Compra recebida",
  purchase_cancellation: "Recebimento estornado",
};

export const STOCK_DIRECTION_LABELS: Record<string, string> = {
  in: "Entrada",
  out: "Saída",
  adjustment: "Ajuste",
};

export function stockSourceLabel(source: string): string {
  return STOCK_SOURCE_LABELS[source] ?? source;
}

/** Variação com sinal: entrada "+5", saída "−2"; ajuste mostra o saldo depois menos o antes. */
export function stockMovementDelta(movement: { direction: string; quantity: number; stock_before: number; stock_after: number }): number {
  if (movement.direction === "in") return movement.quantity;
  if (movement.direction === "out") return -movement.quantity;
  return Math.round((movement.stock_after - movement.stock_before) * 1000) / 1000;
}

export function formatStockDelta(delta: number): string {
  const text = Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return (delta > 0 ? "+" : delta < 0 ? "−" : "") + text;
}
