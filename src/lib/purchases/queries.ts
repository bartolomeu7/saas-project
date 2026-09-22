import "server-only";

import { createClient } from "@/lib/supabase/server";
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
  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_receipts")
    .select("*, purchase_receipt_items(*, products(name))")
    .eq("company_id", companyId)
    .eq("purchase_order_id", purchaseOrderId)
    .order("received_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as PurchaseReceiptWithItems[];
}

export async function listOpenPayables(
  companyId: string,
  limit = 8
): Promise<Array<AccountPayable & { suppliers: { name: string } | null }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounts_payable")
    .select("*, suppliers(name)")
    .eq("company_id", companyId)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as Array<
    AccountPayable & { suppliers: { name: string } | null }
  >;
}

export async function getPurchaseStats(companyId: string) {
  const supabase = createClient();

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
        .select("amount")
        .eq("company_id", companyId)
        .eq("status", "open"),
    ]);

  const openPayables = (payableResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  return {
    totalOrders: ordersResult.count ?? 0,
    ordered: openResult.count ?? 0,
    partiallyReceived: partialResult.count ?? 0,
    received: receivedResult.count ?? 0,
    openPayables,
  };
}