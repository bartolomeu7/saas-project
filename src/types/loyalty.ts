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

/** Um degrau de nível — pontos vitalícios mínimos para alcançá-lo. */
export interface LoyaltyTierThreshold {
  name: string;
  minLifetimePoints: number;
}
