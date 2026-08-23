import "server-only";

export type RankingPeriod = "month" | "quarter" | "semester" | "year" | "custom";

export interface CustomerRankingEntry {
  customerId: string;
  customerName: string;
  revenue: number;
  /** null = sem dados de custo cadastrados ainda para calcular margem real. */
  margin: number | null;
  frequency: number;
  score: number;
}

export interface CustomerRankingResult {
  period: RankingPeriod;
  from: string;
  to: string;
  /** false enquanto não existirem vendas/serviços — nenhum número é inventado. */
  hasRevenueData: boolean;
  /** Deixa explícito se o ranking está baseado em receita bruta ou em margem real. */
  basis: "revenue" | "margin";
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
 * Calcula o ranking de clientes (mais lucrativos / melhor cliente) no
 * período informado.
 *
 * Hoje sempre retorna `hasRevenueData: false` — não existem tabelas de
 * vendas/serviços ainda (Fases 3/4 do roadmap), então não há nenhuma
 * base real de receita ou margem para calcular. Nenhum valor é
 * inventado.
 *
 * Quando as tabelas de vendas/serviços existirem, esta função passa a
 * agregar receita e (quando houver custo cadastrado) margem real por
 * cliente, calcular frequência/recorrência e compor o `score` — sem
 * precisar alterar a UI que já consome este retorno, já que o shape
 * (CustomerRankingResult) já está pronto para isso.
 */
export async function getCustomerRanking(
  _companyId: string,
  period: RankingPeriod,
  range: { from: string; to: string }
): Promise<CustomerRankingResult> {
  return {
    period,
    from: range.from,
    to: range.to,
    hasRevenueData: false,
    basis: "revenue",
    entries: [],
  };
}
