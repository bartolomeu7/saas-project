import "server-only";
import { createSessionClient } from "@/lib/supabase/server";
import { required } from "@/lib/supabase/required";
import { appointmentsWindowEnd } from "@/lib/reports/queries";
import {
  buildAgendaReport,
  buildCustomersReport,
  buildQuotesReport,
  type AgendaReportRow,
  type CustomersReportRow,
  type QuotesReportRow,
} from "@/lib/reports/people";
import type { ReportRange } from "@/types/report";

export async function getCustomersReport(companyId: string, range: ReportRange, inactiveDays: number) {
  const supabase = await createSessionClient();
  const result = await supabase.rpc("report_customers", { p_company_id: companyId, p_from: range.from, p_to: range.to, p_inactive_days: inactiveDays });
  return buildCustomersReport(required(result, "calcular o relatório de clientes") as unknown as CustomersReportRow);
}

/** Mesma janela da Visão geral: em "Mês" e "Ano" entram os atendimentos até o fim deles. */
export async function getAgendaReport(companyId: string, range: ReportRange) {
  const supabase = await createSessionClient();
  const until = appointmentsWindowEnd(range);
  const result = await supabase.rpc("report_agenda", { p_company_id: companyId, p_from: range.from, p_to: until });
  return { ...buildAgendaReport(required(result, "calcular o relatório da agenda") as unknown as AgendaReportRow), until };
}

export async function getQuotesReport(companyId: string, range: ReportRange) {
  const supabase = await createSessionClient();
  const result = await supabase.rpc("report_quotes", { p_company_id: companyId, p_from_date: range.fromDate, p_to_date: range.toDate });
  return buildQuotesReport(required(result, "calcular o relatório de orçamentos") as unknown as QuotesReportRow);
}
