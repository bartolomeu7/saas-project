import type { LoyaltyTierThreshold } from "@/types/loyalty";

/**
 * Thresholds padrão usados quando a empresa ainda não configurou
 * loyalty_tier_thresholds — nunca gravados no banco como dado de exemplo;
 * só um fallback em código (mesmo espírito de classification.ts: nível é
 * sempre calculado, nunca armazenado).
 */
export const DEFAULT_TIER_THRESHOLDS: LoyaltyTierThreshold[] = [
  { name: "Bronze", minLifetimePoints: 0 },
  { name: "Prata", minLifetimePoints: 500 },
  { name: "Ouro", minLifetimePoints: 2000 },
  { name: "Platinum", minLifetimePoints: 5000 },
];

/**
 * Nível do cliente com base em pontos vitalícios ganhos — nunca no saldo
 * atual (resgatar pontos não rebaixa o nível). thresholds deve vir
 * ordenado por minLifetimePoints crescente; usa DEFAULT_TIER_THRESHOLDS
 * quando a empresa não tem configuração própria.
 */
export function calculateLoyaltyTier(
  lifetimePoints: number,
  thresholds: LoyaltyTierThreshold[] = DEFAULT_TIER_THRESHOLDS
): LoyaltyTierThreshold {
  const sorted = [...thresholds].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  let current = sorted[0] ?? DEFAULT_TIER_THRESHOLDS[0]!;
  for (const tier of sorted) {
    if (lifetimePoints >= tier.minLifetimePoints) {
      current = tier;
    }
  }
  return current;
}

/** Próximo nível e quantos pontos faltam — null quando já está no topo. */
export function nextLoyaltyTier(
  lifetimePoints: number,
  thresholds: LoyaltyTierThreshold[] = DEFAULT_TIER_THRESHOLDS
): { tier: LoyaltyTierThreshold; pointsRemaining: number } | null {
  const sorted = [...thresholds].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  const next = sorted.find((tier) => tier.minLifetimePoints > lifetimePoints);
  if (!next) return null;
  return { tier: next, pointsRemaining: next.minLifetimePoints - lifetimePoints };
}
