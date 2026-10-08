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
  last_login_at: string | null;
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
