export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export type PurchaseReceiptStatus = "posted" | "cancelled";
export type AccountsPayableStatus = "open" | "paid" | "cancelled";

export interface PurchaseOrderItem {
  id: string;
  company_id: string;
  purchase_order_id: string;
  product_id: string;
  description: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  total_amount: number;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  order_number: string | null;
  ordered_at: string | null;
  expected_at: string | null;
  due_date: string | null;
  received_at: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseReceipt {
  id: string;
  company_id: string;
  purchase_order_id: string;
  supplier_id: string;
  status: PurchaseReceiptStatus;
  received_at: string;
  received_by: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
}

export interface PurchaseReceiptItem {
  id: string;
  company_id: string;
  purchase_receipt_id: string;
  purchase_order_item_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  previous_cost_price: number;
  created_at: string;
}

export interface AccountPayable {
  id: string;
  company_id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  purchase_receipt_id: string | null;
  description: string;
  amount: number;
  issue_date: string;
  due_date: string | null;
  status: AccountsPayableStatus;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Rascunho",
  ordered: "Pedido",
  partially_received: "Recebido parcialmente",
  received: "Recebido",
  cancelled: "Cancelado",
};