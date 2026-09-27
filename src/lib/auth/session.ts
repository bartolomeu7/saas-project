import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isClerkEnabled } from "@/lib/clerk/config";
import { getClerkCurrentUser } from "@/lib/auth/clerk-session";
import type { Profile } from "@/types/profile";

/**
 * Identidade mínima do usuário autenticado, usada pelos ~40 call-sites
 * espalhados pelo app (Server Actions de negócio, layouts) — todos só
 * leem `.id` (o UUID interno, para colunas de auditoria como
 * write_audit_log's actorUserId) e `.email` (exibição). Antes desta fase,
 * o tipo era o `User` do Supabase Auth; agora é este subconjunto,
 * compatível com os dois caminhos (Supabase Auth e Clerk).
 */
export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Retorna a identidade autenticada da request atual, ou null se não
 * houver sessão. Uso exclusivo server-side.
 *
 * Fase 5B-APP: com isClerkEnabled, a identidade vem do Clerk (`.id` já é o
 * UUID interno resolvido via current_profile_user_id()/ensure_profile() —
 * ver clerk-session.ts). Sem isClerkEnabled, comportamento 100% original
 * (Supabase Auth) — nenhuma mudança para quem não tem o Clerk configurado
 * (Preview/produção continuam assim até o cutover real).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isClerkEnabled) {
    return getClerkCurrentUser();
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

/**
 * Retorna o perfil (public.profiles) do usuário autenticado atual,
 * ou null se não houver sessão ou perfil.
 *
 * Protegido por RLS (profiles_select_own) em ambos os caminhos — só é
 * possível ler o próprio perfil. Com Clerk e antes da Migration E, essa
 * policy ainda usa auth.uid() (não reconhece o token Clerk), então esta
 * leitura falha com 22P02; o erro já era tratado como "sem perfil" (mesmo
 * `if (error || !data) return null` de antes), então o app não quebra —
 * só mostra menos dado até a Migration E, exatamente como esperado nesta
 * fase de transição.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = isClerkEnabled
    ? (await import("@/lib/supabase/clerk-client")).createClerkSupabaseClient()
    : createClient();

  const userId = isClerkEnabled
    ? (await getClerkCurrentUser())?.id
    : (await supabase.auth.getUser()).data.user?.id;

  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}
