import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import type {
  AuditCategory,
  DiagnosticCheck,
  IntegrationsStatus,
  PaymentEventRow,
  PaymentsSummary,
  PlatformAdministratorRow,
  PlatformAuditRow,
  PlatformCompanyDetail,
  PlatformCompanyRow,
  PlatformDashboard,
  PlatformOverview,
  PlatformPaymentDetail,
  PlatformPaymentRow,
  PlatformPlanRow,
  PlatformSettingRow,
  PlatformSubscriptionRow,
  PlatformUserDetail,
  PlatformUserRow,
  PresenceState,
  SearchHit,
  SubscriptionFilterState,
  WebhookDeliveryRow,
} from "@/types/admin";
import type { CompanyStatus } from "@/types/company";
import type { UserRole, UserStatus } from "@/types/profile";

/**
 * Camada de dados do painel da PLATAFORMA (/admin).
 *
 * Toda leitura cross-empresa passa por RPCs SECURITY DEFINER que exigem
 * is_platform_admin() no banco (role admin|super_admin E status active). O
 * client é sempre o de sessão (token do Clerk + chave anon): nunca service_role
 * e nunca company_members.role. A checagem do app (requirePlatformAdmin) é só
 * a primeira camada; a decisão final é do banco.
 */

export const ADMIN_PAGE_SIZE = 25;

/** Usuário da plataforma autenticado, já validado como platform admin. */
export interface PlatformAdminSession {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
}

/**
 * Exige platform admin (profiles.role in admin|super_admin com status active)
 * via is_platform_admin() — a mesma regra das RPCs. Memoizada por request, então
 * layout e páginas podem chamá-la sem custo extra. Quem não é admin volta para
 * /app; quem não tem sessão já foi barrado pelo middleware.
 */
export const requirePlatformAdmin = cache(async (): Promise<PlatformAdminSession> => {
  const supabase = await createSessionClient();
  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin");

  if (error) {
    console.error("[admin] is_platform_admin() falhou:", error.message);
    throw new Error("Não foi possível validar o acesso administrativo.");
  }

  if (!isAdmin) {
    redirect("/app");
  }

  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  if (!user || !profile) {
    redirect("/app");
  }

  return {
    userId: user.id,
    fullName: profile.full_name,
    email: user.email ?? profile.email,
    role: profile.role,
    status: profile.status,
  };
});

/**
 * Exige SUPER_ADMIN (role super_admin com status active) via is_super_admin() —
 * a mesma regra das RPCs exclusivas. Admin comum volta para o dashboard do
 * painel. Memoizada por request. A página é só a segunda camada: o middleware
 * já barra a rota e as RPCs revalidam no banco.
 */
export const requireSuperAdmin = cache(async (): Promise<PlatformAdminSession> => {
  const admin = await requirePlatformAdmin();

  const supabase = await createSessionClient();
  const { data: isSuper, error } = await supabase.rpc("is_super_admin");

  if (error) {
    console.error("[admin] is_super_admin() falhou:", error.message);
    throw new Error("Não foi possível validar o acesso de super administrador.");
  }

  if (!isSuper) {
    redirect("/admin");
  }

  return admin;
});

function fail(rpc: string, message: string, userMessage: string): never {
  console.error(`[admin] ${rpc}() falhou:`, message);
  throw new Error(userMessage);
}

function offsetFor(page: number | undefined) {
  return (Math.max(1, page ?? 1) - 1) * ADMIN_PAGE_SIZE;
}

export interface PlatformListResult<T> {
  rows: T[];
  total: number;
}

/** SUPER_ADMIN ONLY (list_platform_administrators() exige is_super_admin() no banco). */
export async function listPlatformAdministrators(): Promise<PlatformAdministratorRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_administrators");

  if (error) fail("list_platform_administrators", error.message, "Não foi possível carregar a lista de administradores.");
  return (data ?? []) as PlatformAdministratorRow[];
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_admin_overview");

  if (error || !data?.[0]) {
    fail("get_platform_admin_overview", error?.message ?? "sem dados", "Não foi possível carregar o resumo da plataforma.");
  }
  return data[0] as PlatformOverview;
}

export interface PlatformUserFilters {
  search?: string;
  status?: UserStatus;
  role?: UserRole;
  plan?: string;
  subscription?: SubscriptionFilterState;
  presence?: PresenceState;
  sort?: string;
  page?: number;
}

export async function listPlatformUsers(
  filters: PlatformUserFilters
): Promise<PlatformListResult<PlatformUserRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_admin_users", {
    p_search: filters.search || undefined,
    p_status: filters.status,
    p_role: filters.role,
    p_plan_code: filters.plan,
    p_subscription: filters.subscription,
    p_presence: filters.presence,
    p_sort: filters.sort,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_admin_users", error.message, "Não foi possível carregar a lista de usuários.");

  const rows = (data ?? []) as PlatformUserRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getPlatformUserDetail(userId: string): Promise<PlatformUserDetail | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_user_detail", { p_user_id: userId });

  if (error) {
    if (error.message === "Usuário não encontrado.") return null;
    fail("get_platform_user_detail", error.message, "Não foi possível carregar o usuário.");
  }
  return data as unknown as PlatformUserDetail;
}

export interface PlatformCompanyFilters {
  search?: string;
  status?: CompanyStatus;
  plan?: string;
  subscription?: SubscriptionFilterState;
  sort?: string;
  page?: number;
}

export async function listPlatformCompanies(
  filters: PlatformCompanyFilters
): Promise<PlatformListResult<PlatformCompanyRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_admin_companies", {
    p_search: filters.search || undefined,
    p_status: filters.status,
    p_plan_code: filters.plan,
    p_subscription: filters.subscription,
    p_sort: filters.sort,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_admin_companies", error.message, "Não foi possível carregar a lista de empresas.");

  const rows = (data ?? []) as PlatformCompanyRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getPlatformCompanyDetail(companyId: string): Promise<PlatformCompanyDetail | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_company_detail", { p_company_id: companyId });

  if (error) {
    if (error.message === "Empresa não encontrada.") return null;
    fail("get_platform_company_detail", error.message, "Não foi possível carregar a empresa.");
  }
  return data as unknown as PlatformCompanyDetail;
}

export interface PlatformSubscriptionFilters {
  search?: string;
  state?: Exclude<SubscriptionFilterState, "none">;
  plan?: string;
  provider?: string;
  expiringDays?: number;
  sort?: string;
  page?: number;
}

export async function listPlatformSubscriptions(
  filters: PlatformSubscriptionFilters
): Promise<PlatformListResult<PlatformSubscriptionRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_subscriptions", {
    p_search: filters.search || undefined,
    p_state: filters.state,
    p_plan_code: filters.plan,
    p_provider: filters.provider,
    p_expiring_days: filters.expiringDays,
    p_sort: filters.sort,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_subscriptions", error.message, "Não foi possível carregar as assinaturas.");

  const rows = (data ?? []) as PlatformSubscriptionRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export interface PlatformPaymentFilters {
  search?: string;
  status?: "pending" | "paid" | "expired" | "cancelled" | "failed" | "refunded";
  provider?: string;
  method?: string;
  plan?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
}

export async function listPlatformPayments(
  filters: PlatformPaymentFilters
): Promise<PlatformListResult<PlatformPaymentRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_payments", {
    p_search: filters.search || undefined,
    p_status: filters.status,
    p_provider: filters.provider,
    p_method: filters.method,
    p_plan_code: filters.plan,
    p_from: filters.from,
    p_to: filters.to,
    p_sort: filters.sort,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_payments", error.message, "Não foi possível carregar os pagamentos.");

  const rows = (data ?? []) as PlatformPaymentRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getPaymentsSummary(from?: string, to?: string): Promise<PaymentsSummary> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("platform_payments_summary", { p_from: from, p_to: to });

  if (error) fail("platform_payments_summary", error.message, "Não foi possível carregar o resumo financeiro.");
  return data as unknown as PaymentsSummary;
}

export async function getPlatformPaymentDetail(paymentId: string): Promise<PlatformPaymentDetail | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_payment_detail", { p_payment_id: paymentId });

  if (error) {
    if (error.message === "Pagamento não encontrado.") return null;
    fail("get_platform_payment_detail", error.message, "Não foi possível carregar o pagamento.");
  }
  return data as unknown as PlatformPaymentDetail;
}

export async function listPlatformPlans(): Promise<PlatformPlanRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_plans");

  if (error) fail("list_platform_plans", error.message, "Não foi possível carregar os planos.");
  return (data ?? []) as PlatformPlanRow[];
}

export interface PlatformAuditFilters {
  category?: AuditCategory;
  search?: string;
  companyId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export async function listPlatformAudit(
  filters: PlatformAuditFilters
): Promise<PlatformListResult<PlatformAuditRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_audit", {
    p_category: filters.category,
    p_search: filters.search || undefined,
    p_company_id: filters.companyId,
    p_actor_user_id: filters.actorUserId,
    p_from: filters.from,
    p_to: filters.to,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_audit", error.message, "Não foi possível carregar a auditoria.");

  const rows = (data ?? []) as PlatformAuditRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_dashboard");

  if (error) fail("get_platform_dashboard", error.message, "Não foi possível carregar o dashboard.");
  return data as unknown as PlatformDashboard;
}

export async function searchPlatform(query: string): Promise<SearchHit[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("platform_global_search", { p_query: query });

  if (error) {
    // P0001 = validação da própria RPC (ex.: termo curto demais): sem resultados, sem erro.
    if (error.code === "P0001") return [];
    fail("platform_global_search", error.message, "Não foi possível realizar a busca.");
  }
  return (data ?? []) as SearchHit[];
}

export async function getPlatformDiagnostics(): Promise<DiagnosticCheck[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("platform_diagnostics");

  if (error) fail("platform_diagnostics", error.message, "Não foi possível executar os diagnósticos.");
  return (data ?? []) as DiagnosticCheck[];
}

export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("platform_integrations_status");

  if (error) fail("platform_integrations_status", error.message, "Não foi possível carregar as integrações.");
  return data as unknown as IntegrationsStatus;
}

export async function listWebhookDeliveries(filters: {
  provider?: string;
  outcome?: string;
  page?: number;
}): Promise<PlatformListResult<WebhookDeliveryRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_webhook_deliveries", {
    p_provider: filters.provider,
    p_outcome: filters.outcome,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_webhook_deliveries", error.message, "Não foi possível carregar as entregas.");

  const rows = (data ?? []) as WebhookDeliveryRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function listPaymentEvents(filters: {
  provider?: string;
  processed?: boolean;
  page?: number;
}): Promise<PlatformListResult<PaymentEventRow>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_payment_events", {
    p_provider: filters.provider,
    p_processed: filters.processed,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offsetFor(filters.page),
  });

  if (error) fail("list_platform_payment_events", error.message, "Não foi possível carregar os eventos.");

  const rows = (data ?? []) as PaymentEventRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** Configurações reais da plataforma (valor efetivo = padrão quando nunca alterada). */
export async function getPlatformSettings(): Promise<PlatformSettingRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_settings");

  if (error) fail("get_platform_settings", error.message, "Não foi possível carregar as configurações.");
  return (data ?? []) as PlatformSettingRow[];
}

/** Dados que os diálogos de acesso/cobrança precisam: planos ATIVOS e o limite de dias do admin. */
export async function getAccessActionContext() {
  const [plans, settings] = await Promise.all([listPlatformPlans(), getPlatformSettings()]);
  const maxFreeDays = settings.find((setting) => setting.key === "admin_max_free_days")?.value ?? 30;

  return {
    maxFreeDays,
    plans: plans
      .filter((plan) => plan.status === "active")
      .map((plan) => ({
        id: plan.plan_id,
        code: plan.code,
        name: plan.name,
        accessDurationDays: plan.access_duration_days,
        price: plan.price,
      })),
  };
}
