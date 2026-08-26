import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Sale,
  SaleDetail,
  SaleItem,
  SalePayment,
  SalePaymentStatus,
  SaleStatus,
  SaleWithCustomer,
  ProductPick,
  ServicePick,
  CustomerPick,
} from "@/types/sale";

const DEFAULT_PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SaleRow extends Sale {
  customers: { name: string } | null;
}

function mapRow(row: SaleRow): SaleWithCustomer {
  const { customers, ...rest } = row;
  return { ...rest, customer_name: customers?.name ?? null, user_name: null };
}

/** Preenche user_name (profiles.full_name) para um lote de vendas — sales.user_id não tem FK para profiles, então é um segundo lote de busca, igual ao item_count. */
async function attachResponsibleNames(
  supabase: ReturnType<typeof createClient>,
  sales: SaleWithCustomer[]
): Promise<void> {
  if (sales.length === 0) return;

  const userIds = Array.from(new Set(sales.map((s) => s.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", userIds);

  const names: Record<string, string | null> = {};
  for (const profile of profiles ?? []) {
    names[profile.user_id] = profile.full_name;
  }
  for (const sale of sales) {
    sale.user_name = names[sale.user_id] ?? null;
  }
}

export type SalePeriod = "today" | "7d" | "30d" | "month" | "year" | "custom" | "all";

/** Resolve um preset de período em um intervalo [from, to] ISO. */
export function resolveSalePeriodRange(
  period: SalePeriod,
  from?: string,
  to?: string
): { from: string | null; to: string | null } {
  if (period === "all") {
    return { from: null, to: null };
  }
  if (period === "custom") {
    return { from: from ?? null, to: to ?? null };
  }

  const start = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { from: start.toISOString(), to: end.toISOString() };
}

export interface ListSalesParams {
  companyId: string;
  search?: string;
  status?: SaleStatus | "all";
  paymentStatus?: SalePaymentStatus | "all";
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

export interface ListSalesResult {
  sales: SaleWithCustomer[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista vendas de uma empresa, com busca (por cliente ou id exato),
 * filtros de status/pagamento/período e paginação real.
 */
export async function listSales(params: ListSalesParams): Promise<ListSalesResult> {
  const {
    companyId,
    search,
    status = "all",
    paymentStatus = "all",
    from,
    to,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = params;

  const supabase = createClient();

  let query = supabase
    .from("sales")
    .select("*, customers(name)", { count: "exact" })
    .eq("company_id", companyId);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (paymentStatus !== "all") {
    query = query.eq("payment_status", paymentStatus);
  }
  if (from) {
    query = query.gte("sold_at", from);
  }
  if (to) {
    query = query.lte("sold_at", to);
  }

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    const orParts: string[] = [];

    if (UUID_RE.test(trimmedSearch)) {
      orParts.push(`id.eq.${trimmedSearch}`);
    }

    const safeTerm = trimmedSearch.replace(/[,()"\\]/g, "").trim();
    if (safeTerm) {
      const term = safeTerm.replace(/[%_]/g, "\\$&");
      const { data: matchedCustomers } = await supabase
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .ilike("name", `%${term}%`);

      const ids = (matchedCustomers ?? []).map((c) => c.id);
      if (ids.length > 0) {
        orParts.push(`customer_id.in.(${ids.join(",")})`);
      }
    }

    if (orParts.length > 0) {
      query = query.or(orParts.join(","));
    } else {
      // Nenhum cliente/ID bateu com o termo — força resultado vazio em
      // vez de ignorar o filtro de busca.
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  const from_ = (page - 1) * pageSize;
  const to_ = from_ + pageSize - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from_, to_);

  if (error) {
    return { sales: [], total: 0, page, pageSize };
  }

  const sales = ((data ?? []) as SaleRow[]).map(mapRow);

  if (sales.length > 0) {
    const { data: itemRows } = await supabase
      .from("sale_items")
      .select("sale_id")
      .in(
        "sale_id",
        sales.map((s) => s.id)
      );
    const counts: Record<string, number> = {};
    for (const row of itemRows ?? []) {
      counts[row.sale_id] = (counts[row.sale_id] ?? 0) + 1;
    }
    for (const sale of sales) {
      sale.item_count = counts[sale.id] ?? 0;
    }
  }

  await attachResponsibleNames(supabase, sales);

  return { sales, total: count ?? 0, page, pageSize };
}

/** Busca uma venda completa (itens + pagamentos), garantindo que pertence à empresa informada. */
export async function getSaleById(companyId: string, id: string): Promise<SaleDetail | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("sales")
    .select("*, customers(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase
      .from("sale_items")
      .select("*")
      .eq("sale_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("sale_payments")
      .select("*")
      .eq("sale_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const sale = mapRow(data as SaleRow);
  await attachResponsibleNames(supabase, [sale]);

  return {
    ...sale,
    items: (items ?? []) as SaleItem[],
    payments: (payments ?? []) as SalePayment[],
  };
}

export interface SaleStats {
  totalInPeriod: number;
  revenue: number;
  averageTicket: number | null;
  completedCount: number;
  cancelledCount: number;
}

/**
 * Estatísticas para o dashboard e a listagem — sempre a partir de
 * vendas reais, nunca inventadas. Faturamento e ticket médio só
 * consideram vendas `completed` (nunca draft/cancelled), calculados
 * por `completed_at` dentro do período. `totalInPeriod` conta toda
 * venda iniciada no período (`sold_at`), qualquer status.
 */
export const getSaleStats = cache(async function getSaleStats(
  companyId: string,
  from: string | null,
  to: string | null
): Promise<SaleStats> {
  const supabase = createClient();

  let totalQuery = supabase
    .from("sales")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  let completedQuery = supabase
    .from("sales")
    .select("total_amount")
    .eq("company_id", companyId)
    .eq("status", "completed");
  let cancelledQuery = supabase
    .from("sales")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "cancelled");

  if (from) {
    totalQuery = totalQuery.gte("sold_at", from);
    completedQuery = completedQuery.gte("completed_at", from);
    cancelledQuery = cancelledQuery.gte("cancelled_at", from);
  }
  if (to) {
    totalQuery = totalQuery.lte("sold_at", to);
    completedQuery = completedQuery.lte("completed_at", to);
    cancelledQuery = cancelledQuery.lte("cancelled_at", to);
  }

  const [totalResult, completedResult, cancelledResult] = await Promise.all([
    totalQuery,
    completedQuery,
    cancelledQuery,
  ]);

  const completedRows = completedResult.data ?? [];
  const revenue = completedRows.reduce((sum, row) => sum + Number(row.total_amount), 0);
  const completedCount = completedRows.length;

  return {
    totalInPeriod: totalResult.count ?? 0,
    revenue,
    averageTicket: completedCount > 0 ? revenue / completedCount : null,
    completedCount,
    cancelledCount: cancelledResult.count ?? 0,
  };
});

/** Últimas vendas de um cliente específico, para a aba "Compras" do perfil do cliente. */
export async function listSalesByCustomer(
  companyId: string,
  customerId: string,
  limit = 20
): Promise<SaleWithCustomer[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("sales")
    .select("*, customers(name)")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const sales = ((data ?? []) as SaleRow[]).map(mapRow);
  await attachResponsibleNames(supabase, sales);
  return sales;
}

export interface CustomerSalesStats {
  totalSpent: number;
  purchaseCount: number;
  averageTicket: number | null;
  lastPurchaseAt: string | null;
  estimatedMargin: number;
}

/**
 * Estatísticas de vendas de um cliente específico — só considera vendas
 * `completed` (nunca draft/cancelled), mesmo critério do dashboard geral.
 * Usada no perfil do cliente e no ranking.
 */
export const getCustomerSalesStats = cache(async function getCustomerSalesStats(
  companyId: string,
  customerId: string
): Promise<CustomerSalesStats> {
  const supabase = createClient();

  const { data } = await supabase
    .from("sales")
    .select("total_amount, estimated_margin, completed_at")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  const rows = data ?? [];
  const totalSpent = rows.reduce((sum, row) => sum + Number(row.total_amount), 0);
  const estimatedMargin = rows.reduce((sum, row) => sum + Number(row.estimated_margin), 0);

  return {
    totalSpent,
    purchaseCount: rows.length,
    averageTicket: rows.length > 0 ? totalSpent / rows.length : null,
    lastPurchaseAt: rows[0]?.completed_at ?? null,
    estimatedMargin,
  };
});

const PRODUCT_SEARCH_LIMIT = 15;
const SERVICE_SEARCH_LIMIT = 15;
const CUSTOMER_SEARCH_LIMIT = 10;

/** Busca leve de produtos ativos para adicionar a uma venda — nunca carrega o catálogo inteiro. */
export async function searchProductsForSale(
  companyId: string,
  search: string
): Promise<ProductPick[]> {
  const supabase = createClient();
  const trimmed = search.trim();
  if (!trimmed) return [];

  const safeTerm = trimmed.replace(/[,()"\\]/g, "").trim();
  if (!safeTerm) return [];
  const term = safeTerm.replace(/[%_]/g, "\\$&");

  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, barcode, sale_price, cost_price, stock_quantity, unit")
    .eq("company_id", companyId)
    .eq("status", "active")
    .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
    .order("name", { ascending: true })
    .limit(PRODUCT_SEARCH_LIMIT);

  if (error) return [];
  return (data ?? []) as ProductPick[];
}

/** Busca leve de serviços ativos para adicionar a uma venda. */
export async function searchServicesForSale(
  companyId: string,
  search: string
): Promise<ServicePick[]> {
  const supabase = createClient();
  const trimmed = search.trim();
  if (!trimmed) return [];

  const safeTerm = trimmed.replace(/[,()"\\]/g, "").trim();
  if (!safeTerm) return [];
  const term = safeTerm.replace(/[%_]/g, "\\$&");

  const { data, error } = await supabase
    .from("services")
    .select("id, name, sale_price, cost_price, duration_minutes, service_categories(name)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .ilike("name", `%${term}%`)
    .order("name", { ascending: true })
    .limit(SERVICE_SEARCH_LIMIT);

  if (error) return [];
  return ((data ?? []) as unknown as Array<ServicePick & { service_categories: { name: string } | null }>).map(
    (row) => ({
      id: row.id,
      name: row.name,
      category_name: row.service_categories?.name ?? null,
      sale_price: row.sale_price,
      cost_price: row.cost_price,
      duration_minutes: row.duration_minutes,
    })
  );
}

/** Busca leve de clientes ativos para vincular a uma venda. */
export async function searchCustomersForSale(
  companyId: string,
  search: string
): Promise<CustomerPick[]> {
  const supabase = createClient();
  const trimmed = search.trim();
  if (!trimmed) return [];

  const safeTerm = trimmed.replace(/[,()"\\]/g, "").trim();
  if (!safeTerm) return [];
  const term = safeTerm.replace(/[%_]/g, "\\$&");

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("company_id", companyId)
    .eq("status", "active")
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
    .order("name", { ascending: true })
    .limit(CUSTOMER_SEARCH_LIMIT);

  if (error) return [];
  return (data ?? []) as CustomerPick[];
}
