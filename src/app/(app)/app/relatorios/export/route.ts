import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { getReportsWorkspace } from "@/lib/reports/queries";
import { buildReportCsv } from "@/lib/reports/csv";
import { resolveReportRange } from "@/lib/reports/period";
import { buildSalesCsv, parseSalesFilters } from "@/lib/reports/sales";
import { getSalesReport } from "@/lib/reports/sales-queries";
import { getAgendaReport, getCustomersReport, getQuotesReport } from "@/lib/reports/people-queries";
import { parseInactiveDays, parseReportTab } from "@/lib/reports/people";
import {
  agendaDocument,
  commissionDocument,
  customersDocument,
  documentCsv,
  overviewDocument,
  quotesDocument,
  salesDocument,
  type ReportDocument,
} from "@/lib/reports/document";
import { renderReportPdf } from "@/lib/reports/pdf-document";
import { getCurrentRevenueGoal } from "@/lib/reports/goal-queries";
import { getCommissionReport } from "@/lib/reports/commission-queries";
import { formatDateTime } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";

// o desenho do PDF usa APIs do Node
export const runtime = "nodejs";

export async function GET(request: Request) {
  let current;
  try {
    current = await getCurrentCompany();
  } catch (error) {
    if (error instanceof AccountInactiveError) {
      return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    }
    throw error;
  }
  if (!current) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 403 });
  if (!can(current.role, "reports.view")) {
    return NextResponse.json({ error: "Você não tem acesso aos relatórios." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (name: string) => url.searchParams.get(name) ?? undefined;
  const pdf = query("format") === "pdf";
  const tab = parseReportTab(query("aba"));
  const period = query("period") ?? "month";
  const from = query("from");
  const to = query("to");

  let body: string | Buffer;
  let name: string;
  try {
    const range = resolveReportRange(period, from, to);
    const dates = range.period === "custom" ? `${range.fromDate}_${range.toDate}` : range.period;
    const companyId = current.company.id;
    let csv: (() => string) | null = null;
    let document: () => ReportDocument;
    if (tab === "vendas") {
      const filters = parseSalesFilters({ item: query("item"), cliente: query("cliente"), quem: query("quem") });
      const report = await getSalesReport(companyId, range, filters);
      csv = () => buildSalesCsv(report, range, filters);
      document = () => salesDocument(report, range, filters);
    } else if (tab === "clientes") {
      const days = parseInactiveDays(query("sumidos"));
      const report = await getCustomersReport(companyId, range, days);
      document = () => customersDocument(report, range, days);
    } else if (tab === "agenda") {
      const report = await getAgendaReport(companyId, range);
      document = () => agendaDocument(report, range, todayDateSaoPaulo(new Date(report.until)));
    } else if (tab === "comissao") {
      const report = await getCommissionReport(companyId, range);
      document = () => commissionDocument(report, range);
    } else if (tab === "orcamentos") {
      const report = await getQuotesReport(companyId, range);
      document = () => quotesDocument(report, range);
    } else {
      const [report, goal] = await Promise.all([
        getReportsWorkspace(companyId, period, from, to),
        range.period === "month" ? getCurrentRevenueGoal(companyId) : Promise.resolve(null),
      ]);
      csv = () => buildReportCsv(report, goal);
      document = () => overviewDocument(report, goal);
    }
    const slug = tab === "geral" ? "relatorio" : tab;
    name = `prime-ges-${slug}-${dates}.${pdf ? "pdf" : "csv"}`;
    // Visão geral e Vendas mantêm o CSV que já tinham; as demais saem do mesmo documento do PDF
    body = pdf
      ? await renderReportPdf(document(), current.company.name, formatDateTime(new Date().toISOString()))
      : csv
        ? csv()
        : documentCsv(document());
  } catch (error) {
    console.error("[relatorios] exportação falhou:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Não foi possível gerar o relatório agora. Tente novamente." }, { status: 503 });
  }

  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": pdf ? "application/pdf" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
