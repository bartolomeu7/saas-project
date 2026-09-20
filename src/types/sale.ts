/**
 * Tipos de domínio relacionados a vendas, itens e pagamentos. Espelham
 * as tabelas criadas em supabase/migrations/008_sales.sql.
 */

/** Espelha o enum public.sale_status. */
export type SaleStatus = "draft" | "completed" | "cancelled";

/** Espelha o enum public.sale_payment_status (usado em sales e sale_payments). */
export type SalePaymentStatus = "pending" | "paid" | "cancelled" | "refunded";

/** Espelha o enum public.sale_item_type. */
export type SaleItemType = "product" | "service";

/** Espelha o enum public.sale_payment_method. */
export type SalePaymentMethod = "cash" | "pix" | "debit" | "credit" | "other";

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  draft: "Rascunho",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const SALE_PAYMENT_STATUS_LABELS: Record<SalePaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

export const SALE_PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  debit: "Débito",
  credit: "Crédito",
  other: "Outro",
};

/** Espelha a tabela public.sales. */
export interface Sale {
  id: string;
  company_id: string;
  customer_id: string | null;
  user_id: string;
  status: SaleStatus;
  payment_status: SalePaymentStatus;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  total_cost: number;
  estimated_margin: number;
  notes: string | null;
  sold_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Snapshot/auditoria do resgate de fidelidade aplicado nesta venda (0 se nenhum) — nunca fonte de verdade, ver public.loyalty_transactions. */
  loyalty_points_redeemed: number;
  loyalty_discount_amount: number;
}

/** Espelha a tabela public.sale_items — snapshot histórico, nunca depende do catálogo atual. */
export interface SaleItem {
  id: string;
  company_id: string;
  sale_id: string;
  item_type: SaleItemType;
  product_id: string | null;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  subtotal: number;
  total_amount: number;
  created_at: string;
}

/** Espelha a tabela public.sale_payments. */
export interface SalePayment {
  id: string;
  company_id: string;
  sale_id: string;
  method: SalePaymentMethod;
  amount: number;
  status: SalePaymentStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Venda com o nome do cliente e do responsável já resolvidos, para listagem/detalhe. */
export interface SaleWithCustomer extends Sale {
  customer_name: string | null;
  /** Nome do responsável (profiles.full_name) — null se o perfil não tiver nome definido. */
  user_name: string | null;
  /** Quantidade de itens — só para a listagem, evita carregar os itens inteiros. */
  item_count?: number;
}

/** Detalhe completo de uma venda: itens e pagamentos já carregados. */
export interface SaleDetail extends SaleWithCustomer {
  items: SaleItem[];
  payments: SalePayment[];
}

/**
 * Margem percentual — nunca armazenada (estimated_margin, sim, é
 * armazenado por ser caro de reagregar a cada listagem, mas a % é
 * sempre derivada em código), mesmo espírito de calculateMargin() em
 * Produtos/Serviços.
 */
export function calculateMarginPercentage(
  estimatedMargin: number,
  totalAmount: number
): number | null {
  return totalAmount > 0 ? (estimatedMargin / totalAmount) * 100 : null;
}

/** Resultado de uma busca leve de produto para adicionar a uma venda. */
export interface ProductPick {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sale_price: number;
  cost_price: number;
  stock_quantity: number;
  unit: string;
}

/** Resultado de uma busca leve de serviço para adicionar a uma venda. */
export interface ServicePick {
  id: string;
  name: string;
  category_name: string | null;
  sale_price: number;
  cost_price: number;
  duration_minutes: number;
}

/** Resultado de uma busca leve de cliente para vincular a uma venda. */
export interface CustomerPick {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}
