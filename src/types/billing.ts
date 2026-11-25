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

/** Gateways que podem receber as novas cobranças de assinatura. O ativo é escolhido pelo super administrador. */
export const PAYMENT_GATEWAYS = ["misticpay", "syncpay"] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENT_GATEWAY_LABELS: Record<PaymentGateway, string> = {
  misticpay: "MisticPay",
  syncpay: "SyncPay",
};

export function isPaymentGateway(value: unknown): value is PaymentGateway {
  return typeof value === "string" && (PAYMENT_GATEWAYS as readonly string[]).includes(value);
}

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

/** Código da ordem de pagamento mostrado ao cliente e à equipe (espelha a função SQL payment_order_code). */
export function formatOrderCode(orderNumber: number): string {
  return `OP-${String(orderNumber).padStart(6, "0")}`;
}

export const TICKET_REASONS = ["paid_not_released", "pix_problem", "wrong_charge", "refund", "other"] as const;
export type TicketReason = (typeof TICKET_REASONS)[number];

export const TICKET_REASON_LABELS: Record<TicketReason, string> = {
  paid_not_released: "Paguei e o acesso não foi liberado",
  pix_problem: "Não consigo pagar o Pix",
  wrong_charge: "Valor ou plano errado",
  refund: "Quero o estorno",
  other: "Outro assunto",
};

export const TICKET_MESSAGE_MIN = 10;
export const TICKET_MESSAGE_MAX = 1000;

/** O que o cliente lê de payment_support_tickets (sem os identificadores internos de quem abriu/resolveu). */
export interface PaymentTicket {
  id: string;
  reason: TicketReason;
  message: string;
  status: "open" | "resolved";
  reply: string | null;
  resolved_at: string | null;
  created_at: string;
}

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
  /** Número da ordem de pagamento (sequencial, gerado e protegido pelo banco). */
  order_number: number;
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
  /** 'pix' | 'card' nos pagamentos do gateway atual (SyncPay); null nos antigos (EvoPay era sempre Pix) e nos manuais. */
  charge_method: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_submitted_at: string | null;
  card_attempts: number;
  /** Consultas de contingência feitas ao provedor (a SyncPay aceita no máximo 5 por transação). */
  status_checks: number;
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

/** Referência única que associa a cobrança no provedor (vai na descrição da cobrança) ao pagamento interno. */
export function buildExternalReference(subscriptionPaymentId: string): string {
  return `${REFERENCE_PREFIX}:${subscriptionPaymentId}`;
}

export function parseExternalReference(reference: string | null): string | null {
  if (!reference) return null;
  const [prefix, id] = reference.split(":");
  return prefix === REFERENCE_PREFIX && id ? id : null;
}
