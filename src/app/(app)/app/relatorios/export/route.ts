import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getReportsWorkspace } from "@/lib/reports/queries";

function csvEscape(value: string | number) {
  return "\"" + String(value).replaceAll("\"", "\"\"") + "\"";
}

export async function GET(request: Request) {
  const current = await getCurrentCompany();
  if (!current) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 403 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "month";
  const report = await getReportsWorkspace(current.company.id, period);

  const rows: Array<[string, string | number]> = [
    ["Período", report.range.label],
    ["Faturamento", report.summary.revenue.toFixed(2)],
    ["Vendas concluídas", report.summary.completedSales],
    ["Ticket médio", report.summary.averageTicket?.toFixed(2) ?? ""],
    ["Custo das vendas", report.summary.costOfGoods.toFixed(2)],
    ["Despesas operacionais", report.summary.operatingExpenses.toFixed(2)],
    ["Resultado operacional", report.summary.netResult.toFixed(2)],
    ["Contas a receber", report.summary.accountsReceivable.toFixed(2)],
    ["Contas a pagar", report.summary.accountsPayable.toFixed(2)],
    ["Recebíveis vencidos", report.summary.overdueReceivables],
    ["Pagamentos vencidos", report.summary.overduePayables],
    ["Agendamentos", report.appointments.total],
    ["Agendamentos concluídos", report.appointments.completed],
    ["No-show", report.appointments.noShow],
    ["Produtos com estoque baixo", report.inventory.lowStock],
    ["Produtos sem estoque", report.inventory.outOfStock],
  ];

  const lines = rows.map(([label, value]) => csvEscape(label) + "," + csvEscape(value));
  lines.push("");
  lines.push("item,tipo,quantidade,faturamento");
  for (const item of report.topItems) {
    lines.push([item.description, item.itemType, item.quantity, item.revenue.toFixed(2)].map(csvEscape).join(","));
  }

  const csv = "indicador,valor\n" + lines.join("\n");
  return new NextResponse("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"prime-ges-relatorio-" + report.range.period + ".csv\"",
      "Cache-Control": "no-store",
    },
  });
}