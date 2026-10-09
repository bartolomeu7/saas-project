import type { BusinessType, CompanyRole, CompanyStatus } from "@/types/company";
import type { SubscriptionStatus } from "@/types/billing";
import type { UserRole, UserStatus } from "@/types/profile";

/**
 * Tipos do painel administrativo da PLATAFORMA. Espelham o retorno das RPCs
 * SECURITY DEFINER get_platform_admin_overview(), list_platform_admin_users()
 * e list_platform_admin_companies() (migration platform_admin_foundation). Os
 * tipos gerados do Supabase marcam colunas de RETURNS TABLE como não-nulas;
 * aqui os campos opcionais refletem o que o banco realmente pode devolver.
 */

export interface PlatformOverview {
  total_users: number;
  active_users: number;
  inactive_users: number;
  suspended_users: number;
  platform_admins: number;
  total_companies: number;
  active_companies: number;
  inactive_companies: number;
  subscriptions_active: number;
  subscriptions_trialing: number;
  subscriptions_expired: number;
  subscriptions_cancelled: number;
  companies_without_subscription: number;
  active_plans: number;
}

export interface PlatformUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_seen_at: string | null;
  presence: PresenceState;
  clerk_linked: boolean;
  company_id: string | null;
  company_name: string | null;
  company_role: CompanyRole | null;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_expires_at: string | null;
  access_active: boolean;
  total_count: number;
}

export interface PlatformCompanyRow {
  company_id: string;
  name: string;
  business_type: BusinessType;
  status: CompanyStatus;
  created_at: string;
  members_count: number;
  owner_name: string | null;
  owner_email: string | null;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_expires_at: string | null;
  access_active: boolean;
  paid_total: number;
  total_count: number;
}

export interface PlatformAdministratorRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
  clerk_linked: boolean;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  user: "Usuário",
  admin: "Admin",
  super_admin: "Super admin",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  suspended: "Suspenso",
};

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  active: "Ativa",
  inactive: "Inativa",
};

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  employee: "Funcionário",
};

export type PresenceState = "online" | "recent" | "offline";

export const PRESENCE_LABELS: Record<PresenceState, string> = {
  online: "Online agora",
  recent: "Ativo recentemente",
  offline: "Offline",
};

/** Estado derivado da assinatura (filtro das listas), calculado no banco. */
export type SubscriptionFilterState = "active" | "trialing" | "expired" | "cancelled" | "pending" | "none";

export const SUBSCRIPTION_FILTER_LABELS: Record<SubscriptionFilterState, string> = {
  active: "Plano ativo",
  trialing: "Teste grátis",
  expired: "Expirada",
  cancelled: "Cancelada",
  pending: "Pendente",
  none: "Sem assinatura",
};

export interface PlatformSubscriptionRow {
  subscription_id: string;
  company_id: string;
  company_name: string;
  company_status: CompanyStatus;
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  state: Exclude<SubscriptionFilterState, "none">;
  starts_at: string;
  expires_at: string;
  days_left: number;
  provider: string | null;
  paid_total: number;
  last_paid_at: string | null;
  updated_at: string;
  total_count: number;
}

export type PaymentMethod = "pix" | "transfer" | "cash" | "card_external" | "other";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  transfer: "Transferência",
  cash: "Dinheiro",
  card_external: "Cartão (externo)",
  other: "Outro",
};

export const PAYMENT_PROVIDER_LABELS: Record<string, string> = {
  evopay: "EvoPay",
  manual: "Manual",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  expired: "Expirado",
  cancelled: "Cancelado",
  failed: "Falhou",
  refunded: "Estornado",
};

export interface PlatformPaymentRow {
  payment_id: string;
  company_id: string;
  company_name: string;
  plan_code: string;
  plan_name: string;
  provider: string;
  method: string | null;
  status: string;
  amount: number;
  currency: string;
  external_reference: string | null;
  paid_at: string | null;
  created_at: string;
  recorded_by_email: string | null;
  total_count: number;
}

export interface PaymentsSummary {
  currency: string;
  paid_total: number;
  paid_count: number;
  pending_total: number;
  pending_count: number;
  failed_count: number;
  refunded_total: number;
  by_provider: { provider: string; total: number; count: number }[];
  by_method: { method: string; total: number; count: number }[];
}

export const AUDIT_CATEGORIES = [
  "USER_MANAGEMENT",
  "ROLE_CHANGE",
  "STATUS_CHANGE",
  "ACCESS_EXTENSION",
  "PLAN_CHANGE",
  "SUBSCRIPTION_CHANGE",
  "MANUAL_PAYMENT",
  "PAYMENT",
  "ADMIN_ACTION",
  "SYSTEM",
  "WEBHOOK",
  "INTEGRATION",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  USER_MANAGEMENT: "Gestão de usuários",
  ROLE_CHANGE: "Mudança de papel",
  STATUS_CHANGE: "Mudança de status",
  ACCESS_EXTENSION: "Extensão de acesso",
  PLAN_CHANGE: "Mudança de plano",
  SUBSCRIPTION_CHANGE: "Assinatura",
  MANUAL_PAYMENT: "Pagamento manual",
  PAYMENT: "Pagamento",
  ADMIN_ACTION: "Ação administrativa",
  SYSTEM: "Sistema",
  WEBHOOK: "Webhook",
  INTEGRATION: "Integração",
};

export interface AuditEntry {
  id: string;
  action: string;
  category: AuditCategory;
  created_at: string;
  actor_email: string | null;
  actor_name?: string | null;
  metadata: Record<string, unknown>;
}

export interface PlatformAuditRow {
  id: string;
  action: string;
  category: AuditCategory;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  company_id: string | null;
  company_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  target_user_id: string | null;
  target_email: string | null;
  metadata: Record<string, unknown>;
  total_count: number;
}

export interface SubscriptionSummary {
  id: string;
  status: SubscriptionStatus;
  starts_at: string;
  expires_at: string;
  cancelled_at: string | null;
  provider: string | null;
  updated_at: string;
  access_active: boolean;
  days_left: number;
  plan: {
    id: string;
    code: string;
    name: string;
    price: number | null;
    currency: string;
    access_duration_days: number | null;
    trial: boolean;
  };
}

export interface PaymentBrief {
  id: string;
  provider: string;
  method: string | null;
  status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
  external_reference: string | null;
  plan_name: string;
}

export interface PlatformUserDetail {
  profile: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    role: UserRole;
    status: UserStatus;
    created_at: string;
    updated_at: string;
    clerk_linked: boolean;
    clerk_user_id: string | null;
    last_seen_at: string | null;
    presence: PresenceState;
  };
  company: {
    id: string;
    name: string;
    business_type: BusinessType;
    status: CompanyStatus;
    member_role: CompanyRole;
    created_at: string;
  } | null;
  subscription: SubscriptionSummary | null;
  payments: PaymentBrief[];
  audit: AuditEntry[];
}

export interface PlatformCompanyDetail {
  company: {
    id: string;
    name: string;
    business_type: BusinessType;
    status: CompanyStatus;
    created_at: string;
  };
  members: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    company_role: CompanyRole;
    user_status: UserStatus;
    platform_role: UserRole;
    joined_at: string;
    presence: PresenceState;
  }[];
  subscription: SubscriptionSummary | null;
  payments: PaymentBrief[];
  paid_total: number;
  usage: {
    customers: number;
    products: number;
    services: number;
    sales_total: number;
    sales_last_30d: number;
    appointments: number;
    last_sale_at: string | null;
  };
  audit: AuditEntry[];
}

export interface PlatformPaymentDetail {
  payment: {
    id: string;
    company_id: string;
    company_name: string;
    plan_code: string;
    plan_name: string;
    provider: string;
    method: string | null;
    status: string;
    amount: number;
    amount_with_tax: number | null;
    currency: string;
    external_reference: string | null;
    notes: string | null;
    provider_transaction_id: string | null;
    end_to_end_id: string | null;
    payer_name: string | null;
    payer_document_masked: string | null;
    due_at: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
    recorded_by_email: string | null;
  };
  events: { event_id: string; event_type: string; processed: boolean; processed_at: string | null; created_at: string }[];
  deliveries: { provider: string; outcome: string; detail: string | null; received_at: string }[];
  audit: AuditEntry[];
}

export interface PlatformPlanRow {
  plan_id: string;
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  access_duration_days: number | null;
  billing_interval: "month" | "year" | null;
  additional_user_limit: number;
  trial: boolean;
  support_enabled: boolean;
  tickets_enabled: boolean;
  exclusive_groups_enabled: boolean;
  early_access_enabled: boolean;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  subscriptions_count: number;
  active_subscriptions_count: number;
  payments_count: number;
  is_protected: boolean;
}

export interface PlatformDashboard {
  generated_at: string;
  users: { total: number; active: number; suspended: number; inactive: number; admins: number; new_7d: number; new_30d: number };
  presence: { online_now: number; recent: number; seen_24h: number; online_seconds: number; recent_minutes: number };
  companies: { total: number; active: number; inactive: number; new_30d: number };
  subscriptions: {
    active: number;
    trialing: number;
    expired: number;
    cancelled: number;
    pending: number;
    expiring_7d: number;
    expiring_30d: number;
    companies_without_subscription: number;
  };
  revenue: {
    currency: string;
    paid_total: number;
    paid_30d: number;
    paid_prev_30d: number;
    paid_count_30d: number;
    pending_total: number;
    pending_count: number;
    manual_30d: number;
  };
  mrr_estimate: number;
  payments_by_day: { day: string; total: number; count: number }[];
  signups_by_day: { day: string; users: number; companies: number }[];
  subscriptions_by_plan: { plan_code: string; plan_name: string; count: number }[];
  webhooks_24h: { total: number; processed: number; ignored: number; payment_not_found: number; error: number };
  recent_audit: { id: string; action: string; category: AuditCategory; created_at: string; actor_email: string | null }[];
}

export interface SearchHit {
  kind: "user" | "company" | "payment";
  id: string;
  title: string | null;
  subtitle: string | null;
  extra: string | null;
}

export interface DiagnosticCheck {
  check_key: string;
  label: string;
  severity: "ok" | "warn" | "error";
  affected: number;
  hint: string;
}

export interface WebhookDeliveryRow {
  delivery_id: string;
  provider: string;
  external_id: string | null;
  outcome: "processed" | "payment_not_found" | "ignored" | "error";
  detail: string | null;
  received_at: string;
  payment_id: string | null;
  company_id: string | null;
  company_name: string | null;
  total_count: number;
}

export interface PaymentEventRow {
  event_row_id: string;
  provider: string;
  event_id: string;
  event_type: string;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
  payment_id: string | null;
  company_name: string | null;
  total_count: number;
}

export interface IntegrationsStatus {
  evopay: {
    deliveries_24h: number;
    processed_24h: number;
    errors_24h: number;
    unmatched_24h: number;
    last_delivery_at: string | null;
    last_error_at: string | null;
    pending_payments: number;
    pending_older_1h: number;
    last_paid_at: string | null;
    events_total: number;
    events_unprocessed: number;
  };
  clerk: {
    profiles_total: number;
    profiles_linked: number;
    profiles_unlinked: number;
    last_login_at: string | null;
    webhook_configured: boolean;
  };
  supabase: { database: string; checked_at: string; companies: number; audit_logs_total: number };
}

export interface PlatformSettingRow {
  key: string;
  value: number;
  default_value: number;
  min_value: number;
  max_value: number;
  description: string;
  updated_at: string | null;
  updated_by_email: string | null;
}
