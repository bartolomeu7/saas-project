import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import type {
  PlatformAdministratorRow,
  PlatformCompanyRow,
  PlatformOverview,
  PlatformUserRow,
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

/** SUPER_ADMIN ONLY (list_platform_administrators() exige is_super_admin() no banco). */
export async function listPlatformAdministrators(): Promise<PlatformAdministratorRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_platform_administrators");

  if (error) {
    console.error("[admin] list_platform_administrators() falhou:", error.message);
    throw new Error("Não foi possível carregar a lista de administradores.");
  }

  return (data ?? []) as PlatformAdministratorRow[];
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_platform_admin_overview");

  if (error || !data?.[0]) {
    console.error("[admin] get_platform_admin_overview() falhou:", error?.message);
    throw new Error("Não foi possível carregar o resumo da plataforma.");
  }

  return data[0] as PlatformOverview;
}

export interface PlatformListResult<T> {
  rows: T[];
  total: number;
}

export interface PlatformUserFilters {
  search?: string;
  status?: UserStatus;
  role?: UserRole;
  page?: number;
}

export async function listPlatformUsers(
  filters: PlatformUserFilters
): Promise<PlatformListResult<PlatformUserRow>> {
  const supabase = await createSessionClient();
  const page = Math.max(1, filters.page ?? 1);

  const { data, error } = await supabase.rpc("list_platform_admin_users", {
    p_search: filters.search || undefined,
    p_status: filters.status,
    p_role: filters.role,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });

  if (error) {
    console.error("[admin] list_platform_admin_users() falhou:", error.message);
    throw new Error("Não foi possível carregar a lista de usuários.");
  }

  const rows = (data ?? []) as PlatformUserRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export interface PlatformCompanyFilters {
  search?: string;
  status?: CompanyStatus;
  page?: number;
}

export async function listPlatformCompanies(
  filters: PlatformCompanyFilters
): Promise<PlatformListResult<PlatformCompanyRow>> {
  const supabase = await createSessionClient();
  const page = Math.max(1, filters.page ?? 1);

  const { data, error } = await supabase.rpc("list_platform_admin_companies", {
    p_search: filters.search || undefined,
    p_status: filters.status,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });

  if (error) {
    console.error("[admin] list_platform_admin_companies() falhou:", error.message);
    throw new Error("Não foi possível carregar a lista de empresas.");
  }

  const rows = (data ?? []) as PlatformCompanyRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}
