export type OrderItem = { product_id: string; quantity: number; unit_cost: number };

/**
 * Linhas do pedido de compra. A linha intocada (sem produto, sem custo, quantidade padrão) é ignorada; a incompleta
 * ou inválida recusa o pedido apontando o número dela. Antes a linha era descartada e o pedido saía sem ela.
 */
export function checkOrderItems(raw: unknown): { error: string } | { items: OrderItem[] } {
  const items: OrderItem[] = [];
  for (const [index, row] of (Array.isArray(raw) ? raw : []).entries()) {
    const line = (row ?? {}) as { product_id?: unknown; quantity?: unknown; unit_cost?: unknown };
    const productId = String(line.product_id ?? "");
    const quantity = Number(line.quantity ?? 0);
    const unitCost = Number(line.unit_cost ?? 0);
    if (!productId && unitCost === 0 && (quantity === 1 || quantity === 0)) continue;
    const label = `Item ${index + 1}`;
    if (!productId) return { error: `${label}: selecione o produto.` };
    if (!(quantity > 0)) return { error: `${label}: informe uma quantidade maior que zero.` };
    if (!(unitCost >= 0)) return { error: `${label}: o custo não pode ser negativo.` };
    items.push({ product_id: productId, quantity, unit_cost: unitCost });
  }
  return items.length ? { items } : { error: "Adicione pelo menos um produto ao pedido." };
}
