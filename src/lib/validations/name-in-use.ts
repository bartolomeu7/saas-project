import type { createSessionClient } from "@/lib/supabase/server";

type NamedTable = "services" | "service_categories" | "product_categories" | "suppliers" | "financial_categories" | "cost_centers";

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
  excludeId?: string,
  /** filtro extra (ex.: { kind: "expense" } nas categorias financeiras, onde o mesmo nome pode existir em receita e despesa) */
  extra?: Record<string, string>
): Promise<boolean> {
  // as tabelas têm id, company_id e name; o cliente tipado não aceita nome de tabela dinâmico
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any).from(table).select("id").eq("company_id", companyId).ilike("name", escapeLike(name)).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  for (const [column, value] of Object.entries(extra ?? {})) query = query.eq(column, value);
  const { data } = await query;
  return ((data as { id: string }[] | null) ?? []).length > 0;
}
