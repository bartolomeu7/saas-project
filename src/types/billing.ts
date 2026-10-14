/**
 * Tipos de domínio da assinatura do Prime Ges (não confundir com
 * sales/sale_items/sale_payments, que são vendas das empresas
 * usuárias). Espelham as tabelas criadas em
 * supabase/migrations/009_billing_subscriptions.sql.
 */

export type PlanStatus = "active" | "inactive";
export type BillingInterval = "month" | "year";
export type SubscriptionStatus = "trialing" | "pending" | "active" | "expired" | "cancelled";
export type SubscriptionPaymentStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed"
  | "refunded";
export type SubscriptionPaymentMethod = "pix";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Teste grátis",
  pending: "Pendente",
  active: "Plano ativo",
  expired: "Plano expirado",
  cancelled: "Cancelada",
};

export const SUBSCRIPTION_PAYMENT_STATUS_LABELS: Record<SubscriptionPaymentStatus, string> = {
  pending: "Pix aguardando pagamento",
  paid: "Pagamento confirmado",
  expired: "A cobrança expirou",
  cancelled: "Cancelado",
  failed: "Não foi possível confirmar o pagamento",
  refunded: "Estornado",
};

/** Espelha a tabela public.plans. */
export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  access_duration_days: number | null;
  billing_interval: BillingInterval | null;
  billing_interval_count: number | null;
  additional_user_limit: number;
  trial: boolean;
  /** Plano de acesso permanente (sem preço nem duração): concedido pela equipe, nunca vendido pelo Pix. */
  lifetime: boolean;
  support_enabled: boolean;
  tickets_enabled: boolean;
  exclusive_groups_enabled: boolean;
  early_access_enabled: boolean;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
}

/** Benefício COMERCIAL (texto) de um plano — não concede nenhum direito; os direitos reais são os limites/flags do plano. */
export interface PublicPlanBenefit {
  text: string;
  highlighted: boolean;
  /** false = linha "não incluído" (ex.: teste grátis sem suporte). */
  included: boolean;
}

export type PlanKind = "standard" | "trial" | "custom" | "lifetime";

/**
 * Retorno de get_public_plans() (anon pode ler): só campos seguros para o público — sem provider, sem flags
 * administrativas. Desconto/preço anterior/economia vêm CALCULADOS pelo banco e só quando a promoção está vigente.
 */
export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  access_duration_days: number | null;
  additional_user_limit: number;
  trial: boolean;
  support_enabled: boolean;
  tickets_enabled: boolean;
  exclusive_groups_enabled: boolean;
  early_access_enabled: boolean;
  status: PlanStatus;
  kind: PlanKind;
  tagline: string | null;
  highlight: "popular" | "value" | null;
  cta_label: string | null;
  /** https://, mailto: ou caminho interno — validado no banco. */
  contact_url: string | null;
  benefits_title: string | null;
  sort_order: number;
  compare_price: number | null;
  discount_percent: number | null;
  savings_amount: number | null;
  promo_ends_at: string | null;
  benefits: PublicPlanBenefit[];
}

/** Espelha a tabela public.subscriptions — uma única linha "atual" por empresa. */
export interface Subscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  starts_at: string;
  /** null somente em acesso vitalício (lifetime = true). */
  expires_at: string | null;
  lifetime: boolean;
  cancelled_at: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  trial_claimed_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Espelha a tabela public.company_entitlements — cache/projeção, nunca fonte de verdade. */
export interface CompanyEntitlements {
  id: string;
  company_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  access_starts_at: string | null;
  access_expires_at: string | null;
  lifetime: boolean;
  max_additional_users: number;
  support_enabled: boolean;
  tickets_enabled: boolean;
  exclusive_groups_enabled: boolean;
  early_access_enabled: boolean;
  updated_at: string;
}

/** Espelha a tabela public.subscription_payments. */
export interface SubscriptionPayment {
  id: string;
  company_id: string;
  subscription_id: string | null;
  plan_id: string;
  provider: string;
  provider_transaction_id: string | null;
  status: SubscriptionPaymentStatus;
  amount: number;
  tax_amount: number | null;
  amount_with_tax: number | null;
  currency: string;
  pix_qr_code_text: string | null;
  pix_qr_code_url: string | null;
  pix_qr_code_base64: string | null;
  payer_name: string | null;
  payer_document: string | null;
  end_to_end_id: string | null;
  external_reference: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Pagamento com o nome do plano já resolvido, para telas de detalhe/histórico. */
export interface SubscriptionPaymentWithPlan extends SubscriptionPayment {
  plan_name: string;
}

/** Resultado do guard de acesso — nunca confia só em status armazenado. */
export interface ActiveSubscriptionResult {
  subscription: Subscription | null;
  /** true somente quando status é trialing/active E (acesso vitalício OU expires_at ainda no futuro). */
  isActive: boolean;
}

const REFERENCE_PREFIX = "PRIMEGES";

/** Referência única que associa a cobrança na EvoPay ao pagamento interno. */
export function buildExternalReference(subscriptionPaymentId: string): string {
  return `${REFERENCE_PREFIX}:${subscriptionPaymentId}`;
}

export function parseExternalReference(reference: string | null): string | null {
  if (!reference) return null;
  const [prefix, id] = reference.split(":");
  return prefix === REFERENCE_PREFIX && id ? id : null;
}
