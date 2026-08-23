import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ServiceCategory, ServiceStatus } from "@/types/service";

/** Todas as categorias ativas da empresa, para uso em <select> de formulário. */
export async function listActiveCategories(
  companyId: string
): Promise<ServiceCategory[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as ServiceCategory[];
}

export interface ListCategoriesParams {
  companyId: string;
  status?: ServiceStatus | "all";
}

/** Listagem completa (ativas + inativas) para a tela de gerenciamento de categorias. */
export async function listCategories({
  companyId,
  status = "all",
}: ListCategoriesParams): Promise<ServiceCategory[]> {
  const supabase = createClient();

  let query = supabase.from("service_categories").select("*").eq("company_id", companyId);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as ServiceCategory[];
}

export async function getCategoryById(
  companyId: string,
  id: string
): Promise<ServiceCategory | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ServiceCategory;
}

/** Quantos serviços (de qualquer status) usam essa categoria — para avisar antes de inativar. */
export async function countServicesInCategory(
  companyId: string,
  categoryId: string
): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("services")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("category_id", categoryId);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
