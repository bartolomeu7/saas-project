import type { SubscriptionStatus } from "@/types/billing";

/**
 * Regra ÚNICA de "esta assinatura dá acesso agora?" para o código da aplicação (espelha, em TypeScript, a função
 * SQL `subscription_access_active` e as reescritas das leituras do banco):
 *
 *   status em (trialing, active)  E  (acesso vitalício  OU  expires_at no futuro)
 *
 * Módulo puro (sem I/O, sem "server-only"): é importado pelo middleware (Edge), pelo guard, por Server Components e
 * pelos testes unitários. Falha FECHADO: data ausente/ilegível em assinatura com prazo = sem acesso; vitalício só vale
 * com `lifetime === true` explícito — um `expires_at` nulo sozinho NUNCA concede acesso.
 */
export interface AccessSubscription {
  status: SubscriptionStatus;
  expires_at: string | null;
  lifetime?: boolean | null;
}

export function isSubscriptionAccessActive(subscription: AccessSubscription | null | undefined, now: number = Date.now()): boolean {
  if (!subscription) return false;
  if (subscription.status !== "trialing" && subscription.status !== "active") return false;
  if (subscription.lifetime === true) return subscription.expires_at === null;
  if (subscription.expires_at === null) return false;
  const expires = new Date(subscription.expires_at).getTime();
  return Number.isFinite(expires) && expires > now;
}

/** Dias inteiros que faltam (arredondados para cima, mínimo 0); `null` para acesso vitalício ou sem data. */
export function daysUntilExpiry(subscription: AccessSubscription, now: number = Date.now()): number | null {
  if (subscription.lifetime === true || subscription.expires_at === null) return null;
  const expires = new Date(subscription.expires_at).getTime();
  if (!Number.isFinite(expires)) return null;
  return Math.max(0, Math.ceil((expires - now) / 86_400_000));
}
