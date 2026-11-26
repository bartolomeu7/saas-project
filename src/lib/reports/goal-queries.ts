import "server-only";
import { createSessionClient } from "@/lib/supabase/server";
import { todayDateSaoPaulo } from "@/lib/timezone";

/** Meta em vigor no mês atual: a última definida até ele. Zero (removida) ou nenhuma devolve null. */
export async function getCurrentRevenueGoal(companyId: string): Promise<number | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("company_revenue_goals")
    .select("target")
    .eq("company_id", companyId)
    .lte("month", todayDateSaoPaulo().slice(0, 8) + "01")
    .order("month", { ascending: false })
    .limit(1);
  // lista vazia é "sem meta"; falha é erro, nunca "sem meta"
  if (error || !data) throw new Error("Não foi possível consultar a meta: " + (error?.message ?? "sem resposta"));
  const target = Number(data[0]?.target ?? 0);
  return target > 0 ? target : null;
}
