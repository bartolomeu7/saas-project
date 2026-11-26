import "server-only";
import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { startOfMonthSaoPaulo, startOfYearSaoPaulo } from "@/lib/timezone";
import { getStockLevel } from "@/types/product";
import { buildReportWorkspace, type ReportSummaryRow } from "@/lib/reports/summary";
import { previousRange, resolveReportRange } from "@/lib/reports/period";
import type { ReportRange, ReportsWorkspace } from "@/types/report";

/**
 * Fim da janela de agendamentos. Em "Este mês" e "Este ano" a agenda também conta o que ainda vai acontecer
 * até o fim do mês/ano (os agendamentos futuros ficavam de fora, e o relatório do mês escondia a agenda da semana que vem).
 */
export function appointmentsWindowEnd(range: ReportRange): string {
  const now = new Date();
  if (range.period === "month") return new Date(startOfMonthSaoPaulo(1, now).getTime() - 1).toISOString();
  if (range.period === "year") {
    // 1º de janeiro + 366 dias cai sempre em 1º/2 de janeiro do ano seguinte (o ano tem 365 ou 366 dias)
    const insideNextYear = new Date(startOfYearSaoPaulo(now).getTime() + 366 * 24 * 60 * 60 * 1000);
    return new Date(startOfYearSaoPaulo(insideNextYear).getTime() - 1).toISOString();
  }
  return range.to;
}

/** Falha de consulta nunca vira zero na tela: o erro sobe e a página mostra "tentar de novo". */
async function getSummaryRow(companyId: string, range: ReportRange): Promise<ReportSummaryRow> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("report_summary", {
    p_company_id: companyId,
    p_from: range.from,
    p_to: range.to,
    p_appointments_to: appointmentsWindowEnd(range),
  });
  if (error || !data) throw new Error("Não foi possível calcular o relatório: " + (error?.message ?? "sem resposta"));
  return data as unknown as ReportSummaryRow;
}

async function getInventoryLayer(companyId: string) {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("products").select("stock_quantity, minimum_stock").eq("company_id", companyId).eq("status", "active");
  if (error) throw new Error("Não foi possível consultar o estoque: " + error.message);
  const rows = data ?? [];
  return { lowStock: rows.filter((row) => getStockLevel(row) === "low").length, outOfStock: rows.filter((row) => getStockLevel(row) === "out").length };
}

export const getReportsWorkspace = cache(async function getReportsWorkspace(
  companyId: string,
  periodInput?: string,
  fromInput?: string,
  toInput?: string
): Promise<ReportsWorkspace> {
  const range = resolveReportRange(periodInput, fromInput, toInput);
  const before = previousRange(range);
  const [row, previousRow, inventory] = await Promise.all([
    getSummaryRow(companyId, range),
    getSummaryRow(companyId, before),
    getInventoryLayer(companyId),
  ]);
  const { summary } = buildReportWorkspace(previousRow, before, inventory);
  return {
    ...buildReportWorkspace(row, range, inventory),
    previous: {
      fromDate: before.fromDate,
      toDate: before.toDate,
      revenue: summary.revenue,
      completedSales: summary.completedSales,
      averageTicket: summary.averageTicket,
      netResult: summary.netResult,
      received: summary.received,
    },
  };
});
