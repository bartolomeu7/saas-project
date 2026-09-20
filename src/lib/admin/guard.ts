import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { UserRole } from "@/types/profile";

/**
 * Guard de acesso à área administrativa da PLATAFORMA (/admin), separado
 * de src/lib/companies/queries.ts (que resolve company_members — acesso
 * dentro de UMA empresa). Autorização de plataforma nunca é decidida por
 * company_members.role: um owner de empresa não é administrador da
 * plataforma só por ser dono do próprio negócio.
 *
 * Sem "server-only" e sem cookies()/next/headers — mesmo motivo de
 * src/lib/billing/guard.ts: precisa ser importável com segurança tanto
 * pelo middleware (Edge Runtime) quanto por Server Components/layouts
 * futuros da área administrativa, recebendo o client Supabase já pronto
 * como parâmetro em vez de criar o seu próprio.
 */

/**
 * Único lugar que define o que conta como "administrador de plataforma".
 * Reutilizada pelo middleware hoje e por qualquer layout/página de
 * /admin no futuro — nunca reimplementar esta checagem em outro lugar.
 */
export function isPlatformAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Resolve profiles.role do usuário autenticado e já devolve se ele tem
 * acesso administrativo de plataforma. Protegido por RLS
 * (profiles_select_own: user_id = auth.uid()) — só é possível ler o
 * próprio perfil, então esta consulta nunca vaza role de outro usuário.
 */
export async function getPlatformAdminGuardStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ isPlatformAdmin: boolean; role: UserRole | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = (data?.role as UserRole | undefined) ?? null;
  return { isPlatformAdmin: isPlatformAdminRole(role), role };
}
