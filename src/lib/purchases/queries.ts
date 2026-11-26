import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import { sumPayableBalance } from "@/lib/finance/dre";
import type {
  AccountPayable,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseReceipt,
  PurchaseReceiptItem,
} from "@/types/purchase";

export interface PurchaseOrderListRow extends PurchaseOrder {
  suppliers: { name: string } | null;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  suppliers: { name: string } | null;
  purchase_order_items: Array<
    PurchaseOrderItem & {
      products: { name: string; unit: string; stock_quantity: number } | null;
    }
  >;
}

export interface PurchaseReceiptWithItems extends PurchaseReceipt {
  purchase_receipt_items: Array<
    PurchaseReceiptItem & { products: { name: string } | null }
  >;
}

export async function listPurchaseOrders(
  companyId: string,
  status?: PurchaseOrder["status"]
): Promise<PurchaseOrderListRow[]> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("purchase_orders")
    .select("*, suppliers(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as PurchaseOrderListRow[];
}

export async function getPurchaseOrderById(
  companyId: string,
  id: string
): Promise<PurchaseOrderDetail | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "*, suppliers(name), purchase_order_items(*, products(name, unit, stock_quantity))"
    )
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as PurchaseOrderDetail;
}

export async function listPurchaseReceipts(
  companyId: string,
  purchaseOrderId: string
): Promise<PurchaseReceiptWithItems[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("purchase_receipts")
    .select("*, purchase_receipt_items(*, products(name))")
    .eq("company_id", companyId)
    .eq("purchase_order_id", purchaseOrderId)
    .order("received_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as PurchaseReceiptWithItems[];
}

/** Último custo pedido de cada produto a cada fornecedor ("fornecedor:produto" → custo). Custo 0 não vira sugestão. */
export async function listSupplierCosts(companyId: string): Promise<Record<string, number>> {
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("supplier_products")
    .select("supplier_id, product_id, unit_cost")
    .eq("company_id", companyId)
    .gt("unit_cost", 0)
    .order("updated_at", { ascending: false });
  return Object.fromEntries((data ?? []).map((row) => [`${row.supplier_id}:${row.product_id}`, Number(row.unit_cost)]));
}

/** Compras de um fornecedor para a ficha: os 10 pedidos mais recentes, o total de pedidos e as contas ainda em aberto. */
export async function getSupplierPurchases(companyId: string, supplierId: string) {
  const supabase = await createSessionClient();
  const [orders, payables] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("accounts_payable")
      .select("*")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .in("status", ["open", "partial"])
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  if (orders.error || payables.error) return null; // erro nunca aparece como "nada a pagar"
  const open = (payables.data ?? []) as AccountPayable[];
  return {
    orders: (orders.data ?? []) as PurchaseOrder[],
    totalOrders: orders.count ?? 0,
    openPayables: open,
    openBalance: sumPayableBalance(open),
  };
}

export async function getPurchaseStats(companyId: string) {
  const supabase = await createSessionClient();

  const [ordersResult, openResult, partialResult, receivedResult, payableResult] =
    await Promise.all([
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId),
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "ordered"),
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "partially_received"),
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "received"),
      supabase
        .from("accounts_payable")
        .select("amount, paid_amount")
        .eq("company_id", companyId)
        .in("status", ["open", "partial"]),
    ]);

  const openPayables = sumPayableBalance(payableResult.data ?? []);

  return {
    totalOrders: ordersResult.count ?? 0,
    ordered: openResult.count ?? 0,
    partiallyReceived: partialResult.count ?? 0,
    received: receivedResult.count ?? 0,
    openPayables,
  };
}