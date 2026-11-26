import "server-only";
import { createSessionClient } from "@/lib/supabase/server";
import { required } from "@/lib/supabase/required";
import { buildCommissionReport, type CommissionReportRow } from "@/lib/reports/commission";
import type { ReportRange } from "@/types/report";

export async function getCommissionReport(companyId: string, range: ReportRange) {
  const supabase = await createSessionClient();
  const result = await supabase.rpc("report_commission", { p_company_id: companyId, p_from: range.from, p_to: range.to });
  return buildCommissionReport(required(result, "calcular a comissão") as unknown as CommissionReportRow);
}
