import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  LoyaltyAccount,
  LoyaltyCampaign,
  LoyaltyMultiplier,
  LoyaltySettings,
  LoyaltyTierThreshold,
  LoyaltyTransaction,
} from "@/types/loyalty";

/** Configuração de fidelidade da empresa, ou null se ainda não configurada (equivale a desabilitada). */
export const getLoyaltySettings = cache(async function getLoyaltySettings(
  companyId: string
): Promise<LoyaltySettings | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loyalty_settings")
    .select(
      "enabled, points_per_currency_unit, min_purchase_amount_for_points, redemption_value_per_point, min_points_to_redeem, max_redeem_percent_per_sale, points_expire, points_expire_after_days, birthday_bonus_points, first_purchase_bonus_points, grant_on"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return null;

  return {
    enabled: data.enabled,
    pointsPerCurrencyUnit: Number(data.points_per_currency_unit),
    minPurchaseAmountForPoints: Number(data.min_purchase_amount_for_points),
    redemptionValuePerPoint: Number(data.redemption_value_per_point),
    minPointsToRedeem: data.min_points_to_redeem,
    maxRedeemPercentPerSale:
      data.max_redeem_percent_per_sale === null ? null : Number(data.max_redeem_percent_per_sale),
    pointsExpire: data.points_expire,
    pointsExpireAfterDays: data.points_expire_after_days,
    birthdayBonusPoints: data.birthday_bonus_points,
    firstPurchaseBonusPoints: data.first_purchase_bonus_points,
    grantOn: data.grant_on,
  };
});

/** Saldo/pontos vitalícios do cliente — zeros quando o cliente nunca teve nenhuma movimentação. */
export const getLoyaltyAccount = cache(async function getLoyaltyAccount(
  companyId: string,
  customerId: string
): Promise<LoyaltyAccount> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("balance, lifetime_points")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .maybeSingle();

  return {
    balance: data?.balance ?? 0,
    lifetimePoints: data?.lifetime_points ?? 0,
  };
});

/** Histórico do ledger de um cliente, mais recente primeiro. */
export const listLoyaltyTransactions = cache(async function listLoyaltyTransactions(
  companyId: string,
  customerId: string,
  limit = 50
): Promise<LoyaltyTransaction[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loyalty_transactions")
    .select("id, type, points, balance_after, source, reason, created_at")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    points: row.points,
    balanceAfter: row.balance_after,
    source: row.source,
    reason: row.reason,
    createdAt: row.created_at,
  }));
});

/**
 * Thresholds de nível configurados pela empresa — vazio se ainda não
 * configurou (usar DEFAULT_TIER_THRESHOLDS nesse caso). Inclui `id`/
 * `sortOrder` (além de name/minLifetimePoints já usados desde a Etapa
 * 1C) para permitir editar/excluir cada nível na Etapa 1D.3 — mesma
 * query, só com mais colunas selecionadas, nunca uma segunda query.
 */
export const getLoyaltyTierThresholds = cache(async function getLoyaltyTierThresholds(
  companyId: string
): Promise<LoyaltyTierThreshold[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loyalty_tier_thresholds")
    .select("id, name, min_lifetime_points, sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    minLifetimePoints: row.min_lifetime_points,
    sortOrder: row.sort_order,
  }));
});

/**
 * Multiplicadores de pontos por produto/serviço. loyalty_multipliers só
 * guarda product_id/service_id — o nome do item é resolvido aqui com 2
 * consultas simples (produtos, depois serviços), mesmo padrão de
 * getCustomerTopProducts/listCustomerDocuments em vez de um join via
 * dot-notation aninhado do PostgREST.
 */
export const getLoyaltyMultipliers = cache(async function getLoyaltyMultipliers(
  companyId: string
): Promise<LoyaltyMultiplier[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("loyalty_multipliers")
    .select("id, product_id, service_id, multiplier")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const productIds = rows.filter((row) => row.product_id).map((row) => row.product_id as string);
  const serviceIds = rows.filter((row) => row.service_id).map((row) => row.service_id as string);

  const [{ data: products }, { data: services }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    serviceIds.length > 0
      ? supabase.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const productNames = new Map((products ?? []).map((p) => [p.id, p.name]));
  const serviceNames = new Map((services ?? []).map((s) => [s.id, s.name]));

  return rows.map((row) => {
    if (row.product_id) {
      return {
        id: row.id,
        targetType: "product" as const,
        targetId: row.product_id,
        targetName: productNames.get(row.product_id) ?? "Produto removido",
        multiplier: Number(row.multiplier),
      };
    }
    return {
      id: row.id,
      targetType: "service" as const,
      targetId: row.service_id as string,
      targetName: serviceNames.get(row.service_id as string) ?? "Serviço removido",
      multiplier: Number(row.multiplier),
    };
  });
});

/**
 * Campanhas de fidelidade da empresa, mais recentes primeiro. O nome do
 * produto/serviço só é resolvido para linhas legadas com escopo específico
 * (nenhuma criada por esta versão da UI terá product_id/service_id) — mesmo
 * padrão de 2 consultas de getLoyaltyMultipliers, sem join aninhado.
 */
export const getLoyaltyCampaigns = cache(async function getLoyaltyCampaigns(
  companyId: string
): Promise<LoyaltyCampaign[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("loyalty_campaigns")
    .select(
      "id, name, description, multiplier, bonus_points, product_id, service_id, starts_at, ends_at, status"
    )
    .eq("company_id", companyId)
    .order("starts_at", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const productIds = rows.filter((row) => row.product_id).map((row) => row.product_id as string);
  const serviceIds = rows.filter((row) => row.service_id).map((row) => row.service_id as string);

  const [{ data: products }, { data: services }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    serviceIds.length > 0
      ? supabase.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const productNames = new Map((products ?? []).map((p) => [p.id, p.name]));
  const serviceNames = new Map((services ?? []).map((s) => [s.id, s.name]));

  return rows.map((row) => {
    let targetType: "product" | "service" | null = null;
    let targetName: string | null = null;
    if (row.product_id) {
      targetType = "product";
      targetName = productNames.get(row.product_id) ?? "Produto removido";
    } else if (row.service_id) {
      targetType = "service";
      targetName = serviceNames.get(row.service_id) ?? "Serviço removido";
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      multiplier: row.multiplier === null ? null : Number(row.multiplier),
      bonusPoints: row.bonus_points,
      targetType,
      targetName,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
    };
  });
});
