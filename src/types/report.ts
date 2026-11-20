export type ReportPeriod = "today" | "7d" | "30d" | "month" | "year";

export interface ReportRange {
  period: ReportPeriod;
  from: string;
  to: string;
  label: string;
}

export interface ReportSummary {
  revenue: number;
  costOfGoods: number;
  completedSales: number;
  averageTicket: number | null;
  /** Receitas lançadas à mão no Financeiro (fora o recebimento de vendas). */
  otherIncome: number;
  operatingExpenses: number;
  netResult: number;
  accountsReceivable: number;
  accountsPayable: number;
  overdueReceivables: number;
  overduePayables: number;
}

export interface ReportTrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface ReportTopItem {
  description: string;
  quantity: number;
  revenue: number;
  itemType: "product" | "service";
}

export interface ReportPaymentMethod {
  method: string;
  label: string;
  amount: number;
}

export interface ReportAppointments {
  total: number;
  scheduled: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface ReportInventoryAlerts {
  lowStock: number;
  outOfStock: number;
}

export interface ReportsWorkspace {
  range: ReportRange;
  summary: ReportSummary;
  salesTrend: ReportTrendPoint[];
  /** Os 8 itens de maior faturamento (gráfico da tela). */
  topItems: ReportTopItem[];
  /** Todos os itens vendidos no período, do maior para o menor faturamento (exportação CSV). */
  allItems: ReportTopItem[];
  paymentMethods: ReportPaymentMethod[];
  appointments: ReportAppointments;
  inventory: ReportInventoryAlerts;
}