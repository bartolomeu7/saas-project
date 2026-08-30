import "server-only";

import { createClient } from "@/lib/supabase/server";

export type RankingPeriod = "month" | "quarter" | "semester" | "year" | "custom";

export interface CustomerRankingEntry {
  customerId: string;
  customerName: string;
  revenue: number;
  /** Sempre disponível a partir da Fase 4 — cada venda já guarda o custo snapshot dos itens. */
  estimatedMargin: number;
  frequency: number;
  averageTicket: number;
}

export interface CustomerRankingResult {
  period: RankingPeriod;
  from: string;
  to: string;
  /** false enquanto não houver nenhuma venda concluída no período — nenhum número é inventado. */
  hasRevenueData: boolean;
  entries: CustomerRankingEntry[];
}

export function resolvePeriodRange(
  period: RankingPeriod,
  from?: string,
  to?: string
): { from: string; to: string } {
  if (period === "custom" && from && to) {
    return { from, to };
  }

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (period) {
    case "month":
      start.setDate(1);
      break;
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStartMonth, 1);
      break;
    }
    case "semester": {
      const semesterStartMonth = now.getMonth() < 6 ? 0 : 6;
      start.setMonth(semesterStartMonth, 1);
      break;
    }
    case "year":
      start.setMonth(0, 1);
      break;
    default:
      // "custom" sem from/to definidos: últimos 30 dias como padrão razoável.
      start.setDate(start.getDate() - 30);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Ranking de clientes (maior receita / maior frequência / maior ticket /
 * maior contribuição estimada) no período informado — a partir de
 * vendas `completed` reais (Fase 4). Nunca inclui draft/cancelled.
 *
 * "Contribuição estimada" (estimatedMargin), nunca "lucro líquido": não
 * inclui despesas operacionais, impostos ou taxas — só a diferença
 * entre o total vendido e o custo snapshot dos itens.
 */
export async function getCustomerRanking(
  companyId: string,
  period: RankingPeriod,
  range: { from: string; to: string }
): Promise<CustomerRankingResult> {
  const supabase = createClient();

  const { data } = await supabase
    .from("sales")
    .select("customer_id, total_amount, estimated_margin, customers(name)")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .not("customer_id", "is", null)
    .gte("completed_at", range.from)
    .lte("completed_at", range.to);

  const rows = (data ?? []) as Array<{
    customer_id: string;
    total_amount: number;
    estimated_margin: number;
    customers: { name: string } | null;
  }>;

  const byCustomer = new Map<
    string,
    { name: string; revenue: number; margin: number; frequency: number }
  >();

  for (const row of rows) {
    const existing = byCustomer.get(row.customer_id) ?? {
      name: row.customers?.name ?? "Cliente",
      revenue: 0,
      margin: 0,
      frequency: 0,
    };
    existing.revenue += Number(row.total_amount);
    existing.margin += Number(row.estimated_margin);
    existing.frequency += 1;
    byCustomer.set(row.customer_id, existing);
  }

  const entries: CustomerRankingEntry[] = Array.from(byCustomer.entries()).map(
    ([customerId, agg]) => ({
      customerId,
      customerName: agg.name,
      revenue: agg.revenue,
      estimatedMargin: agg.margin,
      frequency: agg.frequency,
      averageTicket: agg.revenue / agg.frequency,
    })
  );

  return {
    period,
    from: range.from,
    to: range.to,
    hasRevenueData: entries.length > 0,
    entries,
  };
}

/** Quantos clientes no topo do ranking por receita (ano corrente) contam como "VIP" — reaproveita getCustomerRanking, nunca um valor de receita fixo/arbitrário. */
const VIP_TOP_N = 3;

export interface CustomerRevenueRank {
  /** Posição (1 = maior receita) dentre os clientes com receita no ano corrente, ou null se o cliente não teve nenhuma venda concluída no ano. */
  position: number | null;
  totalRanked: number;
  isTopTier: boolean;
}

/**
 * Posição de um cliente específico no ranking de receita do ano corrente
 * — reaproveita getCustomerRanking (nunca duplica a agregação) só para
 * localizar a posição do cliente informado. Usado por classifyCustomer
 * para decidir "VIP" de forma relativa à própria empresa, nunca por um
 * valor de receita fixo (que não faria sentido comparando segmentos
 * diferentes).
 */
export async function getCustomerRevenueRank(
  companyId: string,
  customerId: string
): Promise<CustomerRevenueRank> {
  const range = resolvePeriodRange("year");
  const ranking = await getCustomerRanking(companyId, "year", range);
  const sorted = [...ranking.entries].sort((a, b) => b.revenue - a.revenue);
  const index = sorted.findIndex((entry) => entry.customerId === customerId);

  return {
    position: index === -1 ? null : index + 1,
    totalRanked: sorted.length,
    isTopTier: index !== -1 && index < VIP_TOP_N,
  };
}
