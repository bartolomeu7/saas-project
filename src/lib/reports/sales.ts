/**
 * Aba Vendas dos Relatórios: filtros vindos do endereço, margem por item e CSV. Funções puras, com teste unitário;
 * a soma é feita no banco (`report_sales`).
 */
import { csvNumber, csvText } from "./csv.ts";
import { formatDay } from "./period.ts";
import type { ReportRange } from "../../types/report.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ITEM_SEARCH = 80;

export interface SalesFilters {
  /** Trecho do nome do item. */
  item: string;
  /** "", "sem" (vendas sem cliente) ou o id do cliente. */
  customer: string;
  /** "" ou o id de quem registrou a venda. */
  seller: string;
}

/** Só entra o que tem formato válido: o resto é ignorado, como se não houvesse filtro. */
export function parseSalesFilters(input: { item?: string; cliente?: string; quem?: string }): SalesFilters {
  const customer = input.cliente ?? "";
  const seller = input.quem ?? "";
  return {
    item: (input.item ?? "").trim().slice(0, MAX_ITEM_SEARCH),
    customer: customer === "sem" || UUID.test(customer) ? customer : "",
    seller: UUID.test(seller) ? seller : "",
  };
}

/** Parâmetros de endereço dos filtros, para manter a escolha ao trocar de período ou exportar. */
export function salesQuery(filters: SalesFilters): string {
  const params = new URLSearchParams({ aba: "vendas" });
  if (filters.item) params.set("item", filters.item);
  if (filters.customer) params.set("cliente", filters.customer);
  if (filters.seller) params.set("quem", filters.seller);
  return params.toString();
}

type Numeric = number | string;

export interface SalesReportRow {
  sales: Numeric;
  revenue: Numeric;
  cost: Numeric;
  discounts: Numeric;
  items: Array<{ item_type: string; description: string; quantity: Numeric; revenue: Numeric; cost: Numeric; uncosted_quantity: Numeric; uncosted_revenue: Numeric }>;
  sellers: Array<{ user_id: string; sales: Numeric; revenue: Numeric; cost: Numeric }>;
  customers: Array<{ id: string; name: string }>;
}

const number = (value: unknown) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100) / 100;
/** Margem sobre o faturamento, com uma casa. Sem faturamento não há percentual. */
const percentOf = (margin: number, revenue: number) => (revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null);

export function buildSalesReport(raw: SalesReportRow, names: ReadonlyMap<string, string>) {
  const revenue = number(raw.revenue);
  const cost = number(raw.cost);
  const items = raw.items.map((item) => {
    const itemRevenue = number(item.revenue);
    const itemCost = number(item.cost);
    const quantity = number(item.quantity);
    const uncosted = number(item.uncosted_quantity);
    return {
      itemType: item.item_type === "service" ? ("service" as const) : ("product" as const),
      description: item.description,
      quantity,
      revenue: itemRevenue,
      cost: itemCost,
      margin: cents(itemRevenue - itemCost),
      marginPercent: percentOf(itemRevenue - itemCost, itemRevenue),
      /** "all": nenhuma unidade tinha custo; "part": parte delas. */
      uncosted: uncosted <= 0 ? ("none" as const) : uncosted >= quantity ? ("all" as const) : ("part" as const),
    };
  });
  return {
    sales: number(raw.sales),
    revenue,
    cost,
    discounts: number(raw.discounts),
    margin: cents(revenue - cost),
    marginPercent: percentOf(revenue - cost, revenue),
    items,
    uncostedItems: items.filter((item) => item.uncosted !== "none").length,
    uncostedRevenue: cents(raw.items.reduce((sum, item) => sum + number(item.uncosted_revenue), 0)),
    sellers: raw.sellers.map((seller) => ({
      userId: seller.user_id,
      name: names.get(seller.user_id) ?? "Fora da equipe atual",
      sales: number(seller.sales),
      revenue: number(seller.revenue),
      margin: cents(number(seller.revenue) - number(seller.cost)),
    })),
    customers: raw.customers,
  };
}

export type SalesReport = ReturnType<typeof buildSalesReport>;

/** CSV da aba, no padrão do Excel brasileiro (mesmas proteções do CSV geral). */
export function buildSalesCsv(report: SalesReport, range: ReportRange, filters: SalesFilters): string {
  const row = (cells: string[]) => cells.join(";");
  const customer = filters.customer === "sem" ? "Vendas sem cliente" : (report.customers.find((c) => c.id === filters.customer)?.name ?? "Todos");
  const seller = filters.seller ? (report.sellers.find((s) => s.userId === filters.seller)?.name ?? "Selecionado") : "Todos";
  const lines = [
    row([csvText("indicador"), csvText("valor")]),
    row([csvText("Datas"), csvText(`${formatDay(range.fromDate)} a ${formatDay(range.toDate)}`)]),
    row([csvText("Item"), csvText(filters.item || "Todos")]),
    row([csvText("Cliente"), csvText(customer)]),
    row([csvText("Registrada por"), csvText(seller)]),
    row([csvText("Vendas"), String(report.sales)]),
    row([csvText("Faturamento"), csvNumber(report.revenue)]),
    row([csvText("Custo"), csvNumber(report.cost)]),
    row([csvText("Margem"), csvNumber(report.margin)]),
    row([csvText("Descontos nas vendas"), csvNumber(report.discounts)]),
    "",
    row(["item", "tipo", "quantidade", "faturamento", "custo", "margem", "custo cadastrado"].map(csvText)),
    ...report.items.map((item) =>
      row([
        csvText(item.description),
        csvText(item.itemType === "service" ? "serviço" : "produto"),
        csvNumber(item.quantity, 3),
        csvNumber(item.revenue),
        csvNumber(item.cost),
        csvNumber(item.margin),
        csvText(item.uncosted === "none" ? "sim" : item.uncosted === "all" ? "não" : "em parte"),
      ])
    ),
    "",
    row(["registrada por", "vendas", "faturamento", "margem"].map(csvText)),
    ...report.sellers.map((s) => row([csvText(s.name), String(s.sales), csvNumber(s.revenue), csvNumber(s.margin)])),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
