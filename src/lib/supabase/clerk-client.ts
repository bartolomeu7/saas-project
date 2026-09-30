import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Client Supabase autenticado via Clerk (Third-Party Auth). Usado por
 * `createSessionClient()` (src/lib/supabase/server.ts) e diretamente pelos
 * módulos de sessão/empresa desde a Fase 5B-APP/5C — as 88 RLS policies já
 * reconhecem o token do Clerk via `current_profile_user_id()` (Migration
 * E), então este client acessa normalmente as mesmas tabelas que o
 * client Supabase Auth acessaria.
 *
 * Padrão oficial do Supabase para "Third-Party Auth" (não o JWT Template
 * legado): em vez de usar cookies próprios do Supabase Auth, o client
 * recebe uma função `accessToken` que devolve o token de sessão já
 * assinado pelo Clerk a cada request. O Supabase valida esse token via
 * JWKS do Clerk (configuração feita no dashboard do projeto Supabase,
 * Authentication → Sign In / Providers → Third-Party Auth — nenhuma
 * secret é compartilhada entre os dois lados).
 *
 * Só chamar depois que:
 *   1. o provedor Clerk estiver configurado no Supabase (Third-Party Auth);
 *   2. as policies/RPCs tiverem sido adaptadas (Fase 4/5, aprovação à parte).
 * Até lá, isto é só a peça de infraestrutura pedida na Fase 2.
 */
export function createClerkSupabaseClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => (await auth()).getToken(),
    }
  );
}
