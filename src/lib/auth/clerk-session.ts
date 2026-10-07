import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase/clerk-client";
import { AuthBackendError, readJwtRole } from "@/lib/auth/token-claims";

/**
 * Falha do Supabase ao resolver a identidade NÃO é "sem sessão": distingue
 * token sem role=authenticated (config do Clerk) de erro de RPC/banco e
 * lança AuthBackendError, para a UI/rotas mostrarem a causa real.
 */
async function failAuthBackend(step: string, message: string): Promise<never> {
  const role = readJwtRole(await (await auth()).getToken());
  const code = role === "authenticated" ? "AUTH_RPC_FAILED" : "AUTH_ROLE_MISSING";
  console.error(
    `[clerk-session] ${step} falhou (${code}; role do token: ${role ?? "ausente"}):`,
    message
  );
  throw new AuthBackendError(code, `${step}: ${message}`);
}

/**
 * Camada de sessão do lado Clerk.
 *
 * Resolve o UUID interno (profiles.user_id) do usuário Clerk autenticado.
 * Chama a RPC current_profile_user_id() (SECURITY DEFINER). Se ainda não
 * existe profile para este Clerk user (primeiro acesso), cria via
 * ensure_profile() (idempotente) e usa o UUID retornado — "lazy creation",
 * sem depender de webhook.
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
    return failAuthBackend("current_profile_user_id()", lookupError.message);
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
    return failAuthBackend("ensure_profile()", createError.message);
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
