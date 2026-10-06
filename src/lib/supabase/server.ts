import { createClerkSupabaseClient } from "@/lib/supabase/clerk-client";

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 * Autentica com o token de sessão do Clerk (Third-Party Auth do Supabase):
 * o Supabase só atua como banco/RLS/RPCs, a identidade é sempre do Clerk.
 * Continua protegido por RLS (chave anon + JWT do usuário), nunca service role.
 *
 * Uso:
 *   const supabase = await createSessionClient();
 *   const { data } = await supabase.from("...").select();
 */
export async function createSessionClient() {
  return createClerkSupabaseClient();
}
