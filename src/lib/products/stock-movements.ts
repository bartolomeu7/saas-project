import "server-only";

import { createSessionClient } from "@/lib/supabase/server";

export interface StockMovementRow {
  id: string;
  product_id: string;
  product_name: string;
  direction: "in" | "out" | "adjustment";
  quantity: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  source: string;
  created_at: string;
}

/** Movimentações mais recentes do estoque da empresa (entrada, saída e ajuste), do mais novo para o mais antigo. */
export async function listRecentStockMovements(companyId: string, limit = 30): Promise<StockMovementRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await (supabase as any)
    .from("stock_movements")
    .select("id, product_id, direction, quantity, stock_before, stock_after, reason, source, created_at, products(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown> & { products: { name: string } | null }>).map((row) => ({
    id: String(row.id),
    product_id: String(row.product_id),
    product_name: row.products?.name ?? "Produto removido",
    direction: row.direction as StockMovementRow["direction"],
    quantity: Number(row.quantity),
    stock_before: Number(row.stock_before),
    stock_after: Number(row.stock_after),
    reason: String(row.reason ?? ""),
    source: String(row.source ?? ""),
    created_at: String(row.created_at),
  }));
}
