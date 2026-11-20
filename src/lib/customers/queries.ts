import "server-only";

import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { buildSearchOr } from "@/lib/search/pattern";
import type { Customer, CustomerStatus } from "@/types/customer";

const DEFAULT_PAGE_SIZE = 20;

export interface ListCustomersParams {
  companyId: string;
  search?: string;
  status?: CustomerStatus | "all";
  page?: number;
  pageSize?: number;
}

export interface ListCustomersResult {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista clientes de uma empresa, com busca e filtro de status, já
 * paginada — nunca carrega a tabela inteira de uma vez.
 *
 * companyId sempre deve vir de getCurrentCompany() (server-side), nunca
 * de um parâmetro de URL ou input do usuário.
 */
export async function listCustomers({
  companyId,
  search,
  status = "all",
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: ListCustomersParams): Promise<ListCustomersResult> {
  const supabase = await createSessionClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .eq("company_id", companyId);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  // Busca sem acento e tolerante a pontuação (CPF/telefone digitados só com números). Vírgula, parênteses e aspas
  // têm significado especial no filtro .or() do PostgREST: são removidos em buildSearchOr.
  const searchFilter = buildSearchOr(search ?? "", ["name", "email"], ["phone", "whatsapp", "document"]);
  if (searchFilter) query = query.or(searchFilter);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return { customers: [], total: 0, page, pageSize };
  }

  return {
    customers: (data ?? []) as Customer[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Busca um único cliente, garantindo que pertence à empresa informada. */
export async function getCustomerById(
  companyId: string,
  id: string
): Promise<Customer | null> {
  const supabase = await createSessionClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Customer;
}

export interface CustomerStats {
  total: number;
  active: number;
  recent: number;
}

/**
 * Estatísticas simples usadas nos cards do dashboard.
 * Envolvida em `cache()` (memoização por request) porque o dashboard
 * chama essa função a partir de mais de uma seção (card "Clientes
 * cadastrados" e o bloco de estatísticas) — sem isso, seriam duas
 * consultas idênticas ao Supabase na mesma renderização.
 */
export const getCustomerStats = cache(async function getCustomerStats(
  companyId: string
): Promise<CustomerStats> {
  const supabase = await createSessionClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [totalResult, activeResult, recentResult] = await Promise.all([
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", sevenDaysAgo.toISOString()),
  ]);

  return {
    total: totalResult.count ?? 0,
    active: activeResult.count ?? 0,
    recent: recentResult.count ?? 0,
  };
});

/** Últimos clientes cadastrados, para a seção "Clientes recentes" do dashboard. */
export async function getRecentCustomers(
  companyId: string,
  limit = 5
): Promise<Customer[]> {
  const supabase = await createSessionClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []) as Customer[];
}
