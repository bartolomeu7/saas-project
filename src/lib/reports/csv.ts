import type { ReportsWorkspace } from "@/types/report";

const SEPARATOR = ";";

/**
 * Texto vindo do usuário (nome de produto/serviço) pode começar com = + - @ (ou tab/CR) e, aberto no Excel/Sheets,
 * viraria fórmula ("CSV injection"). Um apóstrofo na frente faz a planilha tratar como texto.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

/** Célula de texto: neutraliza fórmula, dobra as aspas e coloca entre aspas. */
export function csvText(value: string | number): string {
  const text = neutralizeFormula(String(value));
  return '"' + text.replaceAll('"', '""') + '"';
}

/** Número no padrão brasileiro (vírgula decimal): o Excel em português só reconhece assim. */
export function csvNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "";
}

function row(cells: string[]): string {
  return cells.join(SEPARATOR);
}

/**
 * Relatório em CSV para o Excel brasileiro: separador ponto e vírgula, vírgula decimal, BOM UTF-8.
 * Traz indicadores, faturamento por dia, formas de pagamento e TODOS os itens vendidos (não só os 8 do gráfico).
 */
export function buildReportCsv(report: ReportsWorkspace): string {
  const { summary, appointments, inventory } = report;
  const lines: string[] = [];
  lines.push(row([csvText("indicador"), csvText("valor")]));
  const indicators: Array<[string, string]> = [
    ["Período", csvText(report.range.label)],
    ["Faturamento", csvNumber(summary.revenue)],
    ["Vendas concluídas", String(summary.completedSales)],
    ["Ticket médio", summary.averageTicket === null ? "" : csvNumber(summary.averageTicket)],
    ["Custo das vendas", csvNumber(summary.costOfGoods)],
    ["Outras receitas", csvNumber(summary.otherIncome)],
    ["Despesas operacionais", csvNumber(summary.operatingExpenses)],
    ["Resultado operacional", csvNumber(summary.netResult)],
    ["Recebido no período (já descontados os estornos)", csvNumber(summary.received)],
    ["Estornos no período", csvNumber(summary.refunds)],
    ["Contas a receber (hoje)", csvNumber(summary.accountsReceivable)],
    ["Contas a pagar (hoje)", csvNumber(summary.accountsPayable)],
    ["Vendas de dias anteriores a receber (hoje)", String(summary.overdueReceivables)],
    ["Contas a pagar vencidas (hoje)", String(summary.overduePayables)],
    ["Agendamentos", String(appointments.total)],
    ["Agendamentos concluídos", String(appointments.completed)],
    ["Agendamentos cancelados", String(appointments.cancelled)],
    ["No-show", String(appointments.noShow)],
    ["Produtos com estoque baixo (hoje)", String(inventory.lowStock)],
    ["Produtos sem estoque (hoje)", String(inventory.outOfStock)],
  ];
  for (const [label, value] of indicators) lines.push(row([csvText(label), value]));

  lines.push("");
  lines.push(row([csvText("dia"), csvText("faturamento")]));
  for (const point of report.salesTrend) lines.push(row([csvText(point.date), csvNumber(point.value)]));

  lines.push("");
  lines.push(row([csvText("forma de pagamento"), csvText("recebido no período")]));
  for (const method of report.paymentMethods) lines.push(row([csvText(method.label), csvNumber(method.amount)]));

  lines.push("");
  lines.push(row([csvText("item"), csvText("tipo"), csvText("quantidade"), csvText("faturamento")]));
  for (const item of report.allItems) {
    lines.push(
      row([csvText(item.description), csvText(item.itemType === "service" ? "serviço" : "produto"), csvNumber(item.quantity, 3), csvNumber(item.revenue)])
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
