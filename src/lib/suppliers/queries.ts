import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import type { Supplier } from "@/types/supplier";

const db = (client: Awaited<ReturnType<typeof createSessionClient>>) => client as any;

export async function listSuppliers(companyId: string, search = ""): Promise<Supplier[]> {
  const supabase = db(await createSessionClient());
  let query = supabase.from("suppliers").select("*").eq("company_id", companyId).order("name");
  const term = search.trim().replace(/[,()\\"]/g, "").replace(/[%_]/g, "\\$&");
  if (term) query = query.or(`name.ilike.%${term}%,legal_name.ilike.%${term}%,document.ilike.%${term}%`);
  const { data, error } = await query;
  return error ? [] : ((data ?? []) as Supplier[]);
}

export async function getSupplierById(companyId: string, id: string): Promise<Supplier | null> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase.from("suppliers").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  return error || !data ? null : (data as Supplier);
}

export async function getSupplierStats(companyId: string) {
  const supabase = db(await createSessionClient());
  const [{ count: total }, { count: active }] = await Promise.all([
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
  ]);
  return { total: total ?? 0, active: active ?? 0, inactive: (total ?? 0) - (active ?? 0) };
}