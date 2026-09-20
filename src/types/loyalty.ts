/** Espelha public.loyalty_settings — 1 linha por empresa. */
export interface LoyaltySettings {
  enabled: boolean;
  pointsPerCurrencyUnit: number;
  minPurchaseAmountForPoints: number;
  redemptionValuePerPoint: number;
  minPointsToRedeem: number;
  maxRedeemPercentPerSale: number | null;
  pointsExpire: boolean;
  pointsExpireAfterDays: number | null;
  birthdayBonusPoints: number;
  firstPurchaseBonusPoints: number;
  grantOn: "completion" | "full_payment";
}

/** Espelha public.loyalty_accounts — 1 linha por cliente. */
export interface LoyaltyAccount {
  balance: number;
  lifetimePoints: number;
}

export type LoyaltyTransactionType = "ganho" | "resgate" | "ajuste" | "expirado" | "reversao";
export type LoyaltyTransactionSource =
  | "sale"
  | "manual"
  | "campaign"
  | "birthday"
  | "first_purchase"
  | "expiration"
  | "reversal";

/** Espelha uma linha do ledger public.loyalty_transactions. */
export interface LoyaltyTransaction {
  id: string;
  type: LoyaltyTransactionType;
  points: number;
  balanceAfter: number;
  source: LoyaltyTransactionSource;
  reason: string | null;
  createdAt: string;
}

export type LoyaltyTierName = "Bronze" | "Prata" | "Ouro" | "Platinum";

/**
 * Um degrau de nível — pontos vitalícios mínimos para alcançá-lo.
 * `id`/`sortOrder` ficam ausentes só para os degraus de DEFAULT_TIER_THRESHOLDS
 * (fallback em código, nunca persistido) — qualquer linha vinda do banco
 * (getLoyaltyTierThresholds) sempre os inclui.
 */
export interface LoyaltyTierThreshold {
  id?: string;
  name: string;
  minLifetimePoints: number;
  sortOrder?: number;
}

/** Espelha uma linha de public.loyalty_multipliers, com o nome do item já resolvido para exibição. */
export interface LoyaltyMultiplier {
  id: string;
  targetType: "product" | "service";
  targetId: string;
  targetName: string;
  multiplier: number;
}

export type LoyaltyCampaignStatus = "active" | "inactive";

/**
 * Espelha uma linha de public.loyalty_campaigns. targetName é resolvido só
 * para exibição de linhas legadas que já tenham product_id/service_id
 * definido — a criação/edição nesta versão sempre grava ambos como null
 * (escopo "venda inteira"), já que grant_loyalty_points_for_sale() ignora
 * por completo campanhas com escopo específico.
 */
export interface LoyaltyCampaign {
  id: string;
  name: string;
  description: string | null;
  multiplier: number | null;
  bonusPoints: number | null;
  targetType: "product" | "service" | null;
  targetName: string | null;
  startsAt: string;
  endsAt: string;
  status: LoyaltyCampaignStatus;
}
