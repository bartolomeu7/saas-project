/**
 * Abas Clientes, Agenda e Orçamentos dos Relatórios. Funções puras, com teste unitário; a soma é feita no banco.
 */
import { QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from "../quotes/rules.ts";

export const REPORT_TABS = [
  { key: "geral", label: "Visão geral" },
  { key: "vendas", label: "Vendas" },
  { key: "clientes", label: "Clientes" },
  { key: "agenda", label: "Agenda" },
  { key: "orcamentos", label: "Orçamentos" },
  { key: "comissao", label: "Comissão" },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]["key"];

export function parseReportTab(value: string | undefined): ReportTab {
  return REPORT_TABS.find((tab) => tab.key === value)?.key ?? "geral";
}

export const INACTIVE_OPTIONS = [30, 60, 90] as const;

export function parseInactiveDays(value: string | undefined): (typeof INACTIVE_OPTIONS)[number] {
  return INACTIVE_OPTIONS.find((days) => String(days) === value) ?? 30;
}

type Numeric = number | string;
const number = (value: unknown) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100) / 100;
/** Percentual com uma casa; sem base não há percentual. */
export const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// ---------------------------------------------------------------- clientes

export interface CustomersReportRow {
  new: { customers: Numeric; sales: Numeric; revenue: Numeric };
  returning: { customers: Numeric; sales: Numeric; revenue: Numeric };
  without_customer: { sales: Numeric; revenue: Numeric };
  registered: Numeric;
  top: Array<{ id: string; name: string; sales: Numeric; revenue: Numeric; new: boolean }>;
  inactive_30: Numeric;
  inactive_60: Numeric;
  inactive_90: Numeric;
  inactive_total: Numeric;
  inactive: Array<{ id: string; name: string; last: string; days: Numeric; sales: Numeric; spent: Numeric }>;
  never_bought: Numeric;
}

export function buildCustomersReport(raw: CustomersReportRow) {
  const group = (value: { customers: Numeric; sales: Numeric; revenue: Numeric }) => ({
    customers: number(value.customers),
    sales: number(value.sales),
    revenue: number(value.revenue),
  });
  const fresh = group(raw.new);
  const returning = group(raw.returning);
  const anonymous = { sales: number(raw.without_customer.sales), revenue: number(raw.without_customer.revenue) };
  const sales = fresh.sales + returning.sales + anonymous.sales;
  return {
    new: fresh,
    returning,
    anonymous,
    buyers: fresh.customers + returning.customers,
    sales,
    /** Parte das vendas que não diz quem comprou. */
    anonymousShare: share(anonymous.sales, sales),
    registered: number(raw.registered),
    top: raw.top.map((row) => ({ id: row.id, name: row.name, sales: number(row.sales), revenue: number(row.revenue), isNew: row.new })),
    inactiveCounts: { 30: number(raw.inactive_30), 60: number(raw.inactive_60), 90: number(raw.inactive_90) },
    inactiveTotal: number(raw.inactive_total),
    inactive: raw.inactive.map((row) => ({ id: row.id, name: row.name, last: row.last, days: number(row.days), sales: number(row.sales), spent: number(row.spent) })),
    neverBought: number(raw.never_bought),
  };
}

// ---------------------------------------------------------------- agenda

export interface AgendaReportRow {
  professionals: Array<{
    id: string | null;
    name: string | null;
    total: Numeric;
    completed: Numeric;
    no_show: Numeric;
    cancelled: Numeric;
    upcoming: Numeric;
    unsettled: Numeric;
    sales: Numeric;
    revenue: Numeric;
  }>;
}

export function buildAgendaReport(raw: AgendaReportRow) {
  const professionals = raw.professionals.map((row) => {
    const completed = number(row.completed);
    const noShow = number(row.no_show);
    return {
      id: row.id,
      name: row.id ? (row.name ?? "Profissional removido") : "Sem profissional",
      total: number(row.total),
      completed,
      noShow,
      /** Faltas sobre quem tinha desfecho (concluído ou falta). */
      noShowRate: share(noShow, completed + noShow),
      cancelled: number(row.cancelled),
      upcoming: number(row.upcoming),
      unsettled: number(row.unsettled),
      sales: number(row.sales),
      revenue: number(row.revenue),
    };
  });
  const sum = (pick: (row: (typeof professionals)[number]) => number) => cents(professionals.reduce((total, row) => total + pick(row), 0));
  const completed = sum((row) => row.completed);
  const noShow = sum((row) => row.noShow);
  return {
    professionals,
    total: sum((row) => row.total),
    completed,
    noShow,
    noShowRate: share(noShow, completed + noShow),
    unsettled: sum((row) => row.unsettled),
    revenue: sum((row) => row.revenue),
  };
}

// ---------------------------------------------------------------- orçamentos

export interface QuotesReportRow {
  by_status: Partial<Record<QuoteDisplayStatus, { count: Numeric; amount: Numeric }>>;
  sold: Numeric;
}

/** Ordem do caminho de um orçamento. */
const QUOTE_ORDER: QuoteDisplayStatus[] = ["draft", "sent", "expired", "approved", "converted", "rejected"];

export function buildQuotesReport(raw: QuotesReportRow) {
  const rows = QUOTE_ORDER.map((status) => ({
    status,
    label: QUOTE_STATUS_LABELS[status],
    count: number(raw.by_status[status]?.count),
    amount: number(raw.by_status[status]?.amount),
  }));
  const count = (status: QuoteDisplayStatus) => rows.find((row) => row.status === status)!.count;
  const approved = count("approved") + count("converted");
  /** Já têm resposta, ou o prazo acabou sem ela. Rascunho e enviado no prazo ainda não contam. */
  const decided = approved + count("rejected") + count("expired");
  return {
    rows,
    issued: rows.reduce((total, row) => total + row.count, 0),
    issuedAmount: cents(rows.reduce((total, row) => total + row.amount, 0)),
    approved,
    decided,
    approvalRate: share(approved, decided),
    converted: count("converted"),
    conversionRate: share(count("converted"), approved),
    sold: number(raw.sold),
  };
}
