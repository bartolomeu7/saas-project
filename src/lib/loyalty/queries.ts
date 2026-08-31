import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  LoyaltyAccount,
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

/** Thresholds de nível configurados pela empresa — vazio se ainda não configurou (usar DEFAULT_TIER_THRESHOLDS nesse caso). */
export const getLoyaltyTierThresholds = cache(async function getLoyaltyTierThresholds(
  companyId: string
): Promise<LoyaltyTierThreshold[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loyalty_tier_thresholds")
    .select("name, min_lifetime_points")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((row) => ({
    name: row.name,
    minLifetimePoints: row.min_lifetime_points,
  }));
});
