import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getStockLevel } from "@/types/product";
import type {
  Product,
  ProductStatus,
  ProductWithCategory,
  StockLevel,
} from "@/types/product";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Janela usada só quando o filtro de nível de estoque (baixo/sem
 * estoque) está ativo. Esse filtro compara duas colunas
 * (stock_quantity vs minimum_stock), e o PostgREST não compara coluna
 * com coluna nos filtros — por isso busca essa janela e filtra/pagina
 * em memória, em vez de no banco. Para o catálogo de uma pequena
 * empresa isso é suficiente; a otimização natural (coluna gerada e
 * indexada) fica para quando o uso real justificar alterar o schema
 * além do confirmado nesta fase.
 */
const STOCK_FILTER_SCAN_LIMIT = 1000;

interface ProductRow extends Product {
  product_categories: { name: string } | null;
}

function mapRow(row: ProductRow): ProductWithCategory {
  const { product_categories, ...rest } = row;
  return { ...rest, category_name: product_categories?.name ?? null };
}

export interface ListProductsParams {
  companyId: string;
  search?: string;
  status?: ProductStatus | "all";
  stockLevel?: StockLevel | "all";
  categoryId?: string;
  sortBy?: "name" | "price" | "stock" | "created_at";
  sortDirection?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ListProductsResult {
  products: ProductWithCategory[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS = {
  name: "name",
  price: "sale_price",
  stock: "stock_quantity",
  created_at: "created_at",
} as const;

/**
 * Lista produtos de uma empresa, com busca, filtros, ordenação e
 * paginação — nunca carrega o catálogo inteiro de uma vez (exceto no
 * caso do filtro de estoque, ver STOCK_FILTER_SCAN_LIMIT acima).
 */
export async function listProducts(
  params: ListProductsParams
): Promise<ListProductsResult> {
  const {
    companyId,
    search,
    status = "all",
    stockLevel = "all",
    categoryId,
    sortBy = "name",
    sortDirection = "asc",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = params;

  const supabase = createClient();
  const sortColumn = SORT_COLUMNS[sortBy];

  let query = supabase
    .from("products")
    .select("*, product_categories(name)", {
      count: stockLevel === "all" ? "exact" : undefined,
    })
    .eq("company_id", companyId);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    // Mesma sanitização aplicada à busca de clientes: vírgula/parênteses
    // têm significado especial no filtro .or() do PostgREST.
    const safeTerm = trimmedSearch.replace(/[,()"\\]/g, "").trim();
    if (safeTerm) {
      const term = safeTerm.replace(/[%_]/g, "\\$&");
      query = query.or(
        `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`
      );
    }
  }

  if (stockLevel === "all") {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order(sortColumn, { ascending: sortDirection === "asc" })
      .range(from, to);

    if (error) {
      return { products: [], total: 0, page, pageSize };
    }

    return {
      products: ((data ?? []) as ProductRow[]).map(mapRow),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  const { data, error } = await query
    .order(sortColumn, { ascending: sortDirection === "asc" })
    .limit(STOCK_FILTER_SCAN_LIMIT);

  if (error) {
    return { products: [], total: 0, page, pageSize };
  }

  const filtered = ((data ?? []) as ProductRow[])
    .map(mapRow)
    .filter((product) => getStockLevel(product) === stockLevel);

  const from = (page - 1) * pageSize;

  return {
    products: filtered.slice(from, from + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

/** Busca um único produto, garantindo que pertence à empresa informada. */
export async function getProductById(
  companyId: string,
  id: string
): Promise<ProductWithCategory | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*, product_categories(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapRow(data as ProductRow);
}

export interface ProductStats {
  total: number;
  active: number;
  lowStock: number;
  outOfStock: number;
}

/**
 * Estatísticas usadas no dashboard e na listagem. Envolvida em
 * `cache()` (memoização por request) pelo mesmo motivo de
 * getCustomerStats: pode ser chamada de mais de uma seção na mesma
 * renderização.
 */
export const getProductStats = cache(async function getProductStats(
  companyId: string
): Promise<ProductStats> {
  const supabase = createClient();

  const [totalResult, activeResult, stockRowsResult] = await Promise.all([
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("products")
      .select("stock_quantity, minimum_stock")
      .eq("company_id", companyId)
      .eq("status", "active"),
  ]);

  const rows = stockRowsResult.data ?? [];
  const lowStock = rows.filter((row) => getStockLevel(row) === "low").length;
  const outOfStock = rows.filter((row) => getStockLevel(row) === "out").length;

  return {
    total: totalResult.count ?? 0,
    active: activeResult.count ?? 0,
    lowStock,
    outOfStock,
  };
});
