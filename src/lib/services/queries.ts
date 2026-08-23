import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Service, ServiceStatus, ServiceWithCategory } from "@/types/service";

const DEFAULT_PAGE_SIZE = 20;

interface ServiceRow extends Service {
  service_categories: { name: string } | null;
}

function mapRow(row: ServiceRow): ServiceWithCategory {
  const { service_categories, ...rest } = row;
  return { ...rest, category_name: service_categories?.name ?? null };
}

export interface ListServicesParams {
  companyId: string;
  search?: string;
  status?: ServiceStatus | "all";
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  minDuration?: number;
  maxDuration?: number;
  sortBy?: "name" | "price" | "duration" | "created_at";
  sortDirection?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ListServicesResult {
  services: ServiceWithCategory[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS = {
  name: "name",
  price: "sale_price",
  duration: "duration_minutes",
  created_at: "created_at",
} as const;

/**
 * Lista serviços de uma empresa, com busca, filtros, ordenação e
 * paginação. Diferente do catálogo de Produtos (que precisa de uma
 * janela em memória para o filtro de nível de estoque), os filtros de
 * preço e duração aqui comparam coluna com valor literal — o PostgREST
 * suporta isso nativamente, então tudo acontece no banco.
 */
export async function listServices(
  params: ListServicesParams
): Promise<ListServicesResult> {
  const {
    companyId,
    search,
    status = "all",
    categoryId,
    minPrice,
    maxPrice,
    minDuration,
    maxDuration,
    sortBy = "name",
    sortDirection = "asc",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = params;

  const supabase = createClient();
  const sortColumn = SORT_COLUMNS[sortBy];

  let query = supabase
    .from("services")
    .select("*, service_categories(name)", { count: "exact" })
    .eq("company_id", companyId);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  if (minPrice !== undefined) {
    query = query.gte("sale_price", minPrice);
  }
  if (maxPrice !== undefined) {
    query = query.lte("sale_price", maxPrice);
  }
  if (minDuration !== undefined) {
    query = query.gte("duration_minutes", minDuration);
  }
  if (maxDuration !== undefined) {
    query = query.lte("duration_minutes", maxDuration);
  }

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    // Mesma sanitização aplicada à busca de produtos/clientes: vírgula/
    // parênteses têm significado especial no filtro .or() do PostgREST.
    const safeTerm = trimmedSearch.replace(/[,()"\\]/g, "").trim();
    if (safeTerm) {
      const term = safeTerm.replace(/[%_]/g, "\\$&");
      query = query.ilike("name", `%${term}%`);
    }
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await query
    .order(sortColumn, { ascending: sortDirection === "asc" })
    .range(from, to);

  if (error) {
    return { services: [], total: 0, page, pageSize };
  }

  return {
    services: ((data ?? []) as ServiceRow[]).map(mapRow),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Busca um único serviço, garantindo que pertence à empresa informada. */
export async function getServiceById(
  companyId: string,
  id: string
): Promise<ServiceWithCategory | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("services")
    .select("*, service_categories(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapRow(data as ServiceRow);
}

export interface ServiceStats {
  total: number;
  active: number;
  inactive: number;
}

/**
 * Estatísticas usadas no dashboard e na listagem. Envolvida em
 * `cache()` (memoização por request) pelo mesmo motivo de
 * getProductStats: pode ser chamada de mais de uma seção na mesma
 * renderização.
 */
export const getServiceStats = cache(async function getServiceStats(
  companyId: string
): Promise<ServiceStats> {
  const supabase = createClient();

  const [totalResult, activeResult, inactiveResult] = await Promise.all([
    supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "inactive"),
  ]);

  return {
    total: totalResult.count ?? 0,
    active: activeResult.count ?? 0,
    inactive: inactiveResult.count ?? 0,
  };
});
