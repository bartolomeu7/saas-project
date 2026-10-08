import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { UserRole, UserStatus } from "@/types/profile";
import { isActivePlatformAdmin, isActiveSuperAdmin } from "@/lib/admin/permissions";

/**
 * Guard de acesso à área administrativa da PLATAFORMA (/admin), separado
 * de src/lib/companies/queries.ts (que resolve company_members — acesso
 * dentro de UMA empresa). Autorização de plataforma nunca é decidida por
 * company_members.role: um owner de empresa não é administrador da
 * plataforma só por ser dono do próprio negócio.
 *
 * Sem "server-only" e sem cookies()/next/headers — mesmo motivo de
 * src/lib/billing/guard.ts: precisa ser importável com segurança tanto
 * pelo middleware (Edge Runtime) quanto por Server Components/layouts da
 * área administrativa, recebendo o client Supabase já pronto como
 * parâmetro em vez de criar o seu próprio.
 *
 * A regra de "quem é administrador" vive em permissions.ts
 * (isActivePlatformAdmin / isActiveSuperAdmin) e é a MESMA aplicada no banco
 * por is_platform_admin() / is_super_admin(): role admin|super_admin E status
 * active. Middleware, layout, páginas, RPCs e RLS não podem divergir.
 */

export interface PlatformAdminGuardStatus {
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
  role: UserRole | null;
  status: UserStatus | null;
}

/**
 * Resolve profiles.role/status do usuário autenticado e devolve se ele tem
 * acesso administrativo de plataforma (e se é super_admin). Protegido por RLS
 * (profiles_select_own: user_id = current_profile_user_id()) — só é possível
 * ler o próprio perfil, então esta consulta nunca vaza dados de outro usuário.
 */
export async function getPlatformAdminGuardStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<PlatformAdminGuardStatus> {
  const { data } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("user_id", userId)
    .maybeSingle();

  const role = (data?.role as UserRole | undefined) ?? null;
  const status = (data?.status as UserStatus | undefined) ?? null;

  return {
    isPlatformAdmin: isActivePlatformAdmin(role, status),
    isSuperAdmin: isActiveSuperAdmin(role, status),
    role,
    status,
  };
}
