import type { UserRole, UserStatus } from "@/types/profile";

/**
 * Hierarquia de plataforma: SUPER_ADMIN > ADMIN > USER.
 *
 * ESTE MÓDULO É SÓ UX/ROTEAMENTO (decide o que mostrar e para onde redirecionar).
 * A autoridade é o banco: toda operação sensível é uma RPC SECURITY DEFINER que
 * revalida o ator (is_platform_admin() / is_super_admin(), com status active),
 * o alvo e a hierarquia, e grava auditoria. As regras abaixo ESPELHAM essas RPCs
 * (supabase/migrations/20261008000000_admin_rbac_hierarchy.sql); se uma mudar, a
 * outra deve mudar junto — mas esconder um botão aqui nunca substitui o banco.
 *
 * Sem "server-only" e sem next/headers: importável pelo middleware (Edge).
 */

/** admin ou super_admin COM status active — mesma regra de is_platform_admin(). */
export function isActivePlatformAdmin(
  role: UserRole | null | undefined,
  status: UserStatus | null | undefined
): boolean {
  return (role === "admin" || role === "super_admin") && status === "active";
}

/** super_admin COM status active — mesma regra de is_super_admin(). */
export function isActiveSuperAdmin(
  role: UserRole | null | undefined,
  status: UserStatus | null | undefined
): boolean {
  return role === "super_admin" && status === "active";
}

/**
 * Suspender/reativar: super_admin age sobre qualquer outro usuário; admin só
 * sobre usuários comuns (role user). Ninguém altera o próprio status.
 */
export function canChangeUserStatus(
  actorRole: UserRole,
  targetRole: UserRole,
  isSelf: boolean
): boolean {
  if (isSelf) return false;
  if (actorRole === "super_admin") return true;
  return actorRole === "admin" && targetRole === "user";
}

/** Alterar papel (promover/rebaixar): exclusivo de super_admin, nunca em si mesmo. */
export function canChangeUserRole(actorRole: UserRole, isSelf: boolean): boolean {
  return actorRole === "super_admin" && !isSelf;
}
