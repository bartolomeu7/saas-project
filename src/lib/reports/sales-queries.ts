import "server-only";
import { createSessionClient } from "@/lib/supabase/server";
import { required } from "@/lib/supabase/required";
import { buildSalesReport, type SalesFilters, type SalesReportRow } from "@/lib/reports/sales";
import { listCompanyTeam } from "@/lib/team/queries";
import type { ReportRange } from "@/types/report";

export async function getSalesReport(companyId: string, range: ReportRange, filters: SalesFilters) {
  const supabase = await createSessionClient();
  const [result, team] = await Promise.all([
    supabase.rpc("report_sales", {
      p_company_id: companyId,
      p_from: range.from,
      p_to: range.to,
      p_customer_id: filters.customer && filters.customer !== "sem" ? filters.customer : undefined,
      p_without_customer: filters.customer === "sem",
      p_user_id: filters.seller || undefined,
      p_item: filters.item || undefined,
    }),
    // só para os nomes de quem registrou: sem a lista, a tela continua com os números
    listCompanyTeam(),
  ]);
  const row = required(result, "calcular o relatório de vendas") as unknown as SalesReportRow;
  return buildSalesReport(row, new Map(team.map((member) => [member.user_id, member.full_name || member.email || "Sem nome"])));
}
