import "server-only";

import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { getClerkCurrentUser, getClerkInternalUserId } from "@/lib/auth/clerk-session";
import type { Profile } from "@/types/profile";

/**
 * Identidade mínima do usuário autenticado, usada pelos ~40 call-sites
 * espalhados pelo app (Server Actions de negócio, layouts): `.id` é o UUID
 * interno (profiles.user_id, usado em colunas de auditoria como o actorUserId
 * de write_audit_log) e `.email` serve para exibição.
 */
export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Retorna a identidade autenticada da request atual, ou null se não
 * houver sessão. Uso exclusivo server-side. A identidade vem do Clerk;
 * `.id` já é o UUID interno resolvido via current_profile_user_id()/
 * ensure_profile() (ver clerk-session.ts).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getClerkCurrentUser();
}

/**
 * Retorna o perfil (public.profiles) do usuário autenticado atual,
 * ou null se não houver sessão ou perfil.
 *
 * Protegido por RLS (profiles_select_own) — só é possível ler o próprio
 * perfil.
 */
export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile | null> {
  // Só o id interno: não precisa esperar a API do Clerk (e-mail) para ler o perfil.
  const userId = await getClerkInternalUserId();

  if (!userId) return null;

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Profile;
});
