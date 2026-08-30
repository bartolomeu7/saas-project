import type { CustomerSalesStats } from "@/lib/sales/queries";

export type CustomerClassification =
  | "novo"
  | "recorrente"
  | "vip"
  | "inativo"
  | "em_risco"
  | "perdido";

export const CUSTOMER_CLASSIFICATION_LABELS: Record<CustomerClassification, string> = {
  novo: "Novo",
  recorrente: "Recorrente",
  vip: "VIP",
  inativo: "Inativo",
  em_risco: "Em risco",
  perdido: "Perdido",
};

/** Dias sem comprar a partir dos quais um cliente que já comprou entra em "em risco"/"perdido". Limiares de negócio, documentados — nunca um valor financeiro inventado. */
const DAYS_UNTIL_AT_RISK = 90;
const DAYS_UNTIL_LOST = 180;
/** Cliente cadastrado há menos que isso, sem compra ainda, continua "novo" em vez de "inativo". */
const DAYS_NEW_CUSTOMER_GRACE = 30;
/** Compras suficientes para considerar "recorrente" quando não é o cliente-destaque (VIP) da empresa. */
const MIN_PURCHASES_FOR_RECURRING = 3;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Classificação sempre calculada em tempo real a partir de dados reais de
 * vendas — nunca armazenada, nunca inventada quando faltam dados.
 *
 * `isTopTier` vem de getCustomerRevenueRank (top N por receita no ano
 * corrente) — "VIP" é sempre relativo à própria empresa, nunca um valor
 * de receita fixo (que não faria sentido comparando um salão a uma
 * distribuidora, por exemplo).
 */
export function classifyCustomer(params: {
  stats: CustomerSalesStats;
  customerCreatedAt: string;
  isTopTier: boolean;
  now?: Date;
}): CustomerClassification {
  const { stats, customerCreatedAt, isTopTier } = params;
  const now = params.now ?? new Date();

  if (stats.purchaseCount === 0) {
    const daysSinceRegistration = daysBetween(now, new Date(customerCreatedAt));
    return daysSinceRegistration <= DAYS_NEW_CUSTOMER_GRACE ? "novo" : "inativo";
  }

  // purchaseCount > 0 garante lastPurchaseAt não-nulo (ver getCustomerSalesStats).
  const daysSinceLastPurchase = daysBetween(now, new Date(stats.lastPurchaseAt!));

  if (daysSinceLastPurchase > DAYS_UNTIL_LOST) {
    return "perdido";
  }
  if (daysSinceLastPurchase > DAYS_UNTIL_AT_RISK) {
    return "em_risco";
  }
  if (isTopTier) {
    return "vip";
  }
  if (stats.purchaseCount >= MIN_PURCHASES_FOR_RECURRING) {
    return "recorrente";
  }
  return "novo";
}
