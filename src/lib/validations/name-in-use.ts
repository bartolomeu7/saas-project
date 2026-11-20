import type { createSessionClient } from "@/lib/supabase/server";

type NamedTable = "services" | "service_categories" | "product_categories";

/** Escapa % e _ (curingas do ilike) e a própria barra, para comparar o nome inteiro de forma literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Já existe OUTRO registro da empresa com este nome, sem diferenciar maiúscula/minúscula?
 * Nome repetido em serviço ou categoria confunde a venda, a agenda e os filtros.
 */
export async function nameInUse(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  table: NamedTable,
  companyId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  // as três tabelas têm id, company_id e name; o cliente tipado não aceita nome de tabela dinâmico
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any).from(table).select("id").eq("company_id", companyId).ilike("name", escapeLike(name)).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return ((data as { id: string }[] | null) ?? []).length > 0;
}
