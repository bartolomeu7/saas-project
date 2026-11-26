/**
 * Cada aba dos Relatórios como um documento (seções com tabelas), usado pelo PDF e pelo CSV das abas novas. Parte dos
 * mesmos dados da tela, então os totais não têm como divergir. Funções puras, com teste unitário.
 */
import { csvNumber, csvText } from "./csv.ts";
import { formatDay } from "./period.ts";
import { groupByMonth } from "./summary.ts";
import { goalProgress, monthName } from "./goal.ts";
import type { SalesFilters, SalesReport } from "./sales.ts";
import type { buildAgendaReport, buildCustomersReport, buildQuotesReport } from "./people.ts";
import type { ReportRange, ReportsWorkspace } from "../../types/report.ts";

export type Cell = string | number | { money: number } | { quantity: number } | { percent: number | null };

export interface DocumentSection {
  title: string;
  /** A primeira coluna é texto; as demais, números. */
  columns: string[];
  rows: Cell[][];
  note?: string;
}

export interface ReportDocument {
  /** Nome curto para o arquivo. */
  slug: string;
  title: string;
  subtitle: string;
  sections: DocumentSection[];
}

const money = (value: number): Cell => ({ money: value });
const quantity = (value: number): Cell => ({ quantity: value });
const percent = (value: number | null): Cell => ({ percent: value });
const optionalMoney = (value: number | null): Cell => (value === null ? "—" : money(value));

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PLAIN = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Como o valor aparece no PDF. */
export function cellText(cell: Cell): string {
  if (typeof cell === "string") return cell;
  if (typeof cell === "number") return PLAIN.format(cell);
  if ("money" in cell) return BRL.format(cell.money);
  if ("quantity" in cell) return PLAIN.format(cell.quantity);
  return cell.percent === null ? "—" : PLAIN.format(cell.percent) + "%";
}

/** Como o valor vai para a planilha: número cru no padrão brasileiro, texto protegido contra fórmula. */
function cellCsv(cell: Cell): string {
  if (typeof cell === "string") return csvText(cell);
  if (typeof cell === "number") return String(cell).replace(".", ",");
  if ("money" in cell) return csvNumber(cell.money);
  if ("quantity" in cell) return csvNumber(cell.quantity, 3);
  return cell.percent === null ? "" : csvNumber(cell.percent, 1);
}

export function documentCsv(document: ReportDocument): string {
  const lines = [csvText(document.title), csvText(document.subtitle)];
  for (const section of document.sections) {
    lines.push("", csvText(section.title), section.columns.map(csvText).join(";"));
    for (const row of section.rows) lines.push(row.map(cellCsv).join(";"));
    if (section.note) lines.push(csvText(section.note));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const period = (range: ReportRange) => `${formatDay(range.fromDate)} a ${formatDay(range.toDate)}`;
const indicators = (title: string, rows: Cell[][], note?: string): DocumentSection => ({ title, columns: ["Indicador", "Valor"], rows, note });

/** `goal`: meta do mês corrente, só quando o relatório é o do mês. */
function goalSection(target: number, revenue: number, today: string): DocumentSection {
  const progress = goalProgress(target, revenue, today);
  return indicators(`Meta de ${monthName(today)}`, [
    ["Meta", money(target)],
    ["Faturamento até agora", money(revenue)],
    ["Alcançado", percent(progress.percent)],
    ["Falta", money(progress.remaining)],
    ["Necessário por dia, contando hoje", money(progress.perDay)],
  ]);
}

export function overviewDocument(report: ReportsWorkspace, goal: number | null = null): ReportDocument {
  const { summary, range, previous, appointments, inventory } = report;
  const byMonth = range.period === "year" || report.salesTrend.length > 62;
  const trend = byMonth ? groupByMonth(report.salesTrend) : report.salesTrend;
  const main: DocumentSection = previous
    ? {
        title: "Resultado do período",
        columns: ["Indicador", "Período", "Anterior"],
        rows: [
          ["Faturamento", money(summary.revenue), money(previous.revenue)],
          ["Vendas concluídas", summary.completedSales, previous.completedSales],
          ["Ticket médio", optionalMoney(summary.averageTicket), optionalMoney(previous.averageTicket)],
          ["Resultado operacional", money(summary.netResult), money(previous.netResult)],
          ["Recebido, descontados os estornos", money(summary.received), money(previous.received)],
        ],
        note: `Período anterior: ${formatDay(previous.fromDate)} a ${formatDay(previous.toDate)}.`,
      }
    : indicators("Resultado do período", [
        ["Faturamento", money(summary.revenue)],
        ["Vendas concluídas", summary.completedSales],
        ["Ticket médio", optionalMoney(summary.averageTicket)],
        ["Resultado operacional", money(summary.netResult)],
        ["Recebido, descontados os estornos", money(summary.received)],
      ]);

  return {
    slug: "relatorio",
    title: "Visão geral",
    subtitle: period(range),
    sections: [
      main,
      ...(goal === null ? [] : [goalSection(goal, summary.revenue, range.toDate)]),
      indicators("Como se chega no resultado", [
        ["Faturamento", money(summary.revenue)],
        ["(-) Custo das vendas", money(summary.costOfGoods)],
        ["(+) Outras receitas", money(summary.otherIncome)],
        ["(-) Despesas operacionais", money(summary.operatingExpenses)],
        ["(=) Resultado operacional", money(summary.netResult)],
      ]),
      {
        title: "Recebimentos por forma de pagamento",
        columns: ["Forma", "Valor"],
        rows: report.paymentMethods.map((method) => [method.label, money(method.amount)]),
        note: summary.refunds > 0 ? `Já descontados ${BRL.format(summary.refunds)} de estornos.` : undefined,
      },
      {
        title: byMonth ? "Faturamento por mês" : "Faturamento por dia",
        columns: [byMonth ? "Mês" : "Dia", "Faturamento"],
        rows: trend.map((point) => [point.label, money(point.value)]),
      },
      {
        title: "Itens vendidos",
        columns: ["Item", "Quantidade", "Faturamento"],
        rows: report.allItems.map((item) => [item.description, quantity(item.quantity), money(item.revenue)]),
        note: "Valores por item, antes dos descontos dados na venda inteira.",
      },
      indicators("Atendimentos", [
        ["Total", appointments.total],
        ["Concluídos", appointments.completed],
        ["Confirmados", appointments.confirmed],
        ["Agendados", appointments.scheduled],
        ["Cancelados", appointments.cancelled],
        ["Faltas", appointments.noShow],
      ]),
      indicators("Posição de hoje", [
        ["A receber", money(summary.accountsReceivable)],
        ["Vendas de dias anteriores a receber", summary.overdueReceivables],
        ["A pagar", money(summary.accountsPayable)],
        ["Contas a pagar vencidas", summary.overduePayables],
        ["Produtos sem estoque", inventory.outOfStock],
        ["Produtos com estoque baixo", inventory.lowStock],
      ], "Não muda com o período escolhido."),
    ],
  };
}

export function salesDocument(report: SalesReport, range: ReportRange, filters: SalesFilters): ReportDocument {
  const customer = filters.customer === "sem" ? "Vendas sem cliente" : (report.customers.find((c) => c.id === filters.customer)?.name ?? "Todos");
  const seller = filters.seller ? (report.sellers.find((s) => s.userId === filters.seller)?.name ?? "Selecionado") : "Todos";
  return {
    slug: "vendas",
    title: "Vendas",
    subtitle: `${period(range)} | Item: ${filters.item || "todos"} | Cliente: ${customer} | Registrada por: ${seller}`,
    sections: [
      indicators("Resumo", [
        ["Vendas concluídas", report.sales],
        ["Faturamento", money(report.revenue)],
        ["Custo", money(report.cost)],
        ["Margem", money(report.margin)],
        ["Margem sobre o faturamento", percent(report.marginPercent)],
        ["Descontos nas vendas", filters.item ? "—" : money(report.discounts)],
      ], report.uncostedItems > 0 ? `${report.uncostedItems} item(ns) com venda sem custo cadastrado (${BRL.format(report.uncostedRevenue)}): a margem aparece maior do que é.` : undefined),
      {
        title: "Itens vendidos",
        columns: ["Item", "Qtd.", "Faturamento", "Custo", "Margem", "%"],
        rows: report.items.map((item) => [
          item.uncosted === "none" ? item.description : `${item.description} (${item.uncosted === "all" ? "sem custo" : "parte sem custo"})`,
          quantity(item.quantity),
          money(item.revenue),
          money(item.cost),
          money(item.margin),
          percent(item.marginPercent),
        ]),
        note: "Valores por item, antes dos descontos dados na venda inteira.",
      },
      {
        title: "Por quem registrou a venda",
        columns: ["Pessoa", "Vendas", "Faturamento", "Margem"],
        rows: report.sellers.map((s) => [s.name, s.sales, money(s.revenue), money(s.margin)]),
      },
    ],
  };
}

export function customersDocument(report: ReturnType<typeof buildCustomersReport>, range: ReportRange, inactiveDays: number): ReportDocument {
  return {
    slug: "clientes",
    title: "Clientes",
    subtitle: period(range),
    sections: [
      {
        title: "Quem comprou no período",
        columns: ["Grupo", "Clientes", "Vendas", "Faturamento"],
        rows: [
          ["Novos (primeira compra)", report.new.customers, report.new.sales, money(report.new.revenue)],
          ["Recorrentes", report.returning.customers, report.returning.sales, money(report.returning.revenue)],
          ["Vendas sem cliente", "—", report.anonymous.sales, money(report.anonymous.revenue)],
        ],
        note: `${report.registered} cliente(s) cadastrado(s) no período.`,
      },
      {
        title: "Quem mais comprou no período",
        columns: ["Cliente", "Compras", "Faturamento"],
        rows: report.top.map((row) => [row.isNew ? `${row.name} (novo)` : row.name, row.sales, money(row.revenue)]),
      },
      {
        title: `Sem comprar há ${inactiveDays} dias ou mais (posição de hoje)`,
        columns: ["Cliente", "Última compra", "Dias", "Total gasto"],
        rows: report.inactive.map((row) => [row.name, formatDay(row.last), row.days, money(row.spent)]),
        note:
          (report.inactiveTotal > report.inactive.length ? `Mostrando os ${report.inactive.length} que mais gastaram, de ${report.inactiveTotal}. ` : "") +
          `${report.neverBought} cliente(s) ativo(s) nunca compraram.`,
      },
    ],
  };
}

export function agendaDocument(report: ReturnType<typeof buildAgendaReport>, range: ReportRange, untilDate: string): ReportDocument {
  return {
    slug: "agenda",
    title: "Agenda",
    subtitle: `Atendimentos marcados de ${formatDay(range.fromDate)} a ${formatDay(untilDate)}`,
    sections: [
      indicators("Resumo", [
        ["Atendimentos", report.total],
        ["Concluídos", report.completed],
        ["Faltas", report.noShow],
        ["Faltas sobre concluídos e faltas", percent(report.noShowRate)],
        ["Sem baixa", report.unsettled],
        ["Vendas ligadas", money(report.revenue)],
      ]),
      {
        title: "Por profissional",
        columns: ["Profissional", "Total", "Concluídos", "Faltas", "% faltas", "Cancelados", "A fazer", "Sem baixa", "Vendas"],
        rows: report.professionals.map((row) => [row.name, row.total, row.completed, row.noShow, percent(row.noShowRate), row.cancelled, row.upcoming, row.unsettled, money(row.revenue)]),
        note: "Vendas: só as geradas ao concluir um atendimento.",
      },
    ],
  };
}

export function quotesDocument(report: ReturnType<typeof buildQuotesReport>, range: ReportRange): ReportDocument {
  return {
    slug: "orcamentos",
    title: "Orçamentos",
    subtitle: `Emitidos de ${period(range)}, com a situação de hoje`,
    sections: [
      indicators("Resumo", [
        ["Emitidos", report.issued],
        ["Valor emitido", money(report.issuedAmount)],
        ["Aprovação", percent(report.approvalRate)],
        ["Aprovados que viraram venda", percent(report.conversionRate)],
        ["Vendido", money(report.sold)],
      ], "Aprovação conta aprovados e convertidos sobre os que já têm resposta ou venceram sem ela."),
      { title: "Por situação", columns: ["Situação", "Quantidade", "Valor"], rows: report.rows.map((row) => [row.label, row.count, money(row.amount)]) },
    ],
  };
}
