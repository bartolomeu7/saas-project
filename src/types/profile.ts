/**
 * Tipos de domínio relacionados ao usuário/perfil.
 * Espelham exatamente os enums e a tabela criados em
 * supabase/migrations/001_create_profiles.sql.
 */

/** Espelha o enum public.user_role. */
export type UserRole = "user" | "admin" | "super_admin";

/** Espelha o enum public.user_status. */
export type UserStatus = "active" | "inactive" | "suspended";

/** Espelha a tabela public.profiles. */
export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: UserStatus;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

/**
 * Campos de profiles que o próprio usuário pode atualizar pelo frontend.
 * user_id, role e status são propositalmente excluídos — protegidos por
 * RLS + trigger no banco (defesa em profundidade).
 */
export type ProfileUpdatableFields = Partial<
  Pick<Profile, "full_name" | "avatar_url">
>;
