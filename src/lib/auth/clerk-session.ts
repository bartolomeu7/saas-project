import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase/clerk-client";

/**
 * Fase 5B-APP — camada de sessão do lado Clerk. Só é chamada quando
 * isClerkEnabled (ver src/lib/clerk/config.ts); session.ts e
 * companies/queries.ts decidem qual caminho usar.
 *
 * Resolve o UUID interno (profiles.user_id) do usuário Clerk autenticado.
 * Chama a RPC current_profile_user_id() (SECURITY DEFINER — funciona hoje,
 * mesmo com as 88 RLS policies ainda em auth.uid(), porque RPCs não passam
 * pelas policies de tabela). Se ainda não existe profile para este Clerk
 * user (primeiro acesso), cria via ensure_profile() (idempotente) e usa o
 * UUID retornado — é a "lazy creation" desenhada na Fase 4/5, sem depender
 * de webhook.
 *
 * Qualquer leitura/escrita direta em tabela (profiles, company_members,
 * companies...) feita com o client Clerk continua sujeita às RLS antigas
 * (auth.uid()) e por isso ainda falha com 22P02 até a Migration E — isso é
 * esperado nesta fase e não é tratado aqui.
 */
export async function getClerkInternalUserId(): Promise<string | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  // current_profile_user_id()/ensure_profile() (Fase 4/5, migrations
  // clerk_phase4_b/c) ainda não existem no types/supabase.ts gerado —
  // arquivo gerado a partir do schema antes destas duas funções. Cast local
  // e pontual, sem alterar o gerador nem o schema.
  const supabase = createClerkSupabaseClient() as unknown as {
    rpc(fn: "current_profile_user_id"): Promise<{ data: string | null; error: { message: string } | null }>;
    rpc(
      fn: "ensure_profile",
      args: { p_full_name: string | null; p_email: string | null }
    ): Promise<{ data: string | null; error: { message: string } | null }>;
  };

  const { data: existingId, error: lookupError } = await supabase.rpc(
    "current_profile_user_id"
  );
  if (lookupError) {
    console.error("[clerk-session] current_profile_user_id() falhou:", lookupError.message);
    return null;
  }
  if (existingId) return existingId;

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() || null;
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;

  const { data: createdId, error: createError } = await supabase.rpc("ensure_profile", {
    p_full_name: fullName,
    p_email: email,
  });
  if (createError) {
    console.error("[clerk-session] ensure_profile() falhou:", createError.message);
    return null;
  }
  return createdId;
}

/** Usuário Clerk atual, já com o UUID interno resolvido (ou null sem sessão). */
export async function getClerkCurrentUser(): Promise<{ id: string; email: string | null } | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const internalId = await getClerkInternalUserId();
  if (!internalId) return null;

  return {
    id: internalId,
    email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
  };
}
