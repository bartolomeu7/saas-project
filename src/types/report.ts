export type ReportPeriod = "today" | "7d" | "30d" | "month" | "year" | "custom";

export interface ReportRange {
  period: ReportPeriod;
  from: string;
  to: string;
  /** Primeiro e último dia do período (AAAA-MM-DD, São Paulo). */
  fromDate: string;
  toDate: string;
  label: string;
  /** As datas pedidas não serviram e o período mostrado é o padrão. */
  invalid?: boolean;
}

/** Números do período anterior, para a comparação. */
export interface ReportPrevious {
  fromDate: string;
  toDate: string;
  revenue: number;
  completedSales: number;
  averageTicket: number | null;
  netResult: number;
  received: number;
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
  /** Recebido de vendas no período (pela data do recebimento), já descontados os estornos. */
  received: number;
  refunds: number;
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
  /** Um ponto por dia do período, inclusive os dias sem venda. */
  salesTrend: ReportTrendPoint[];
  /** Os 8 itens de maior faturamento (gráfico da tela). */
  topItems: ReportTopItem[];
  /** Todos os itens vendidos no período, do maior para o menor faturamento (exportação CSV). */
  allItems: ReportTopItem[];
  paymentMethods: ReportPaymentMethod[];
  appointments: ReportAppointments;
  inventory: ReportInventoryAlerts;
  previous?: ReportPrevious;
}