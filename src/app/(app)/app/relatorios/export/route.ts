import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { getReportsWorkspace } from "@/lib/reports/queries";
import { buildReportCsv } from "@/lib/reports/csv";
import { resolveReportRange } from "@/lib/reports/period";
import { buildSalesCsv, parseSalesFilters } from "@/lib/reports/sales";
import { getSalesReport } from "@/lib/reports/sales-queries";

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
  const period = url.searchParams.get("period") ?? "month";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  let csv: string;
  let name: string;
  try {
    const range = resolveReportRange(period, from, to);
    const dates = range.period === "custom" ? `${range.fromDate}_${range.toDate}` : range.period;
    if (url.searchParams.get("aba") === "vendas") {
      const filters = parseSalesFilters({
        item: url.searchParams.get("item") ?? undefined,
        cliente: url.searchParams.get("cliente") ?? undefined,
        quem: url.searchParams.get("quem") ?? undefined,
      });
      csv = buildSalesCsv(await getSalesReport(current.company.id, range, filters), range, filters);
      name = `prime-ges-vendas-${dates}.csv`;
    } else {
      csv = buildReportCsv(await getReportsWorkspace(current.company.id, period, from, to));
      name = `prime-ges-relatorio-${dates}.csv`;
    }
  } catch (error) {
    console.error("[relatorios] exportação falhou:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Não foi possível gerar o relatório agora. Tente novamente." }, { status: 503 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
