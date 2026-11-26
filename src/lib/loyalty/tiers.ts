import type { LoyaltyTierThreshold } from "@/types/loyalty";

/**
 * Thresholds padrão usados quando a empresa ainda não configurou
 * loyalty_tier_thresholds — nunca gravados no banco como dado de exemplo;
 * só um fallback em código (mesmo espírito de classification.ts: nível é
 * sempre calculado, nunca armazenado).
 */
export const DEFAULT_TIER_THRESHOLDS: LoyaltyTierThreshold[] = [
  { name: "Bronze", minLifetimePoints: 0, sortOrder: 0 },
  { name: "Prata", minLifetimePoints: 500, sortOrder: 1 },
  { name: "Ouro", minLifetimePoints: 2000, sortOrder: 2 },
  { name: "Platinum", minLifetimePoints: 5000, sortOrder: 3 },
];

type TierInput = Pick<LoyaltyTierThreshold, "name" | "minLifetimePoints">;

/**
 * Primeira personalização: a empresa parte dos níveis padrão, trocando o editado (`replaces`) — ou o de mesmo nome ou
 * pontos — pelo enviado. Salvar só o enviado fazia os outros três sumirem.
 */
export function mergeWithDefaultTiers(submitted: TierInput, replaces?: string): { tiers: TierInput[] } | { error: string } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const base: TierInput[] = DEFAULT_TIER_THRESHOLDS.map(({ name, minLifetimePoints }) => ({ name, minLifetimePoints }));
  const index = base.findIndex((tier) =>
    replaces ? same(tier.name, replaces) : same(tier.name, submitted.name) || tier.minLifetimePoints === submitted.minLifetimePoints
  );
  if (index >= 0) base.splice(index, 1);
  if (base.some((tier) => same(tier.name, submitted.name))) return { error: "Já existe um nível com esse nome." };
  if (base.some((tier) => tier.minLifetimePoints === submitted.minLifetimePoints)) {
    return { error: "Já existe um nível com essa mesma quantidade de pontos mínimos." };
  }
  return { tiers: [...base, submitted].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints) };
}

/**
 * Nível do cliente com base em pontos vitalícios ganhos — nunca no saldo
 * atual (resgatar pontos não rebaixa o nível). thresholds deve vir
 * ordenado por minLifetimePoints crescente; usa DEFAULT_TIER_THRESHOLDS
 * quando a empresa não tem configuração própria.
 */
export function calculateLoyaltyTier(
  lifetimePoints: number,
  thresholds: LoyaltyTierThreshold[] = DEFAULT_TIER_THRESHOLDS
): LoyaltyTierThreshold | null {
  const sorted = [...thresholds].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  // abaixo do primeiro limite o cliente ainda não tem nível
  let current: LoyaltyTierThreshold | null = null;
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
