import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { isClerkEnabled } from "@/lib/clerk/config";
import { createClerkSupabaseClient } from "@/lib/supabase/clerk-client";

/**
 * Cliente Supabase para uso em Server Components, Route Handlers e
 * Server Actions. Usa a chave pública (anon) + cookies de sessão do
 * usuário — continua protegido pelo RLS, não pelo service role.
 *
 * Padrão `getAll`/`setAll` (não mais `get`/`set`/`remove`, descontinuado
 * pelo `@supabase/ssr` — a própria lib documenta risco de "random logouts,
 * early session termination or increased token refresh requests" com o
 * padrão antigo, especialmente relevante aqui porque o app tem dois
 * provedores de login — e-mail/senha e Google —, o que tende a aumentar o
 * tamanho do JWT e sua fragmentação em múltiplos cookies).
 *
 * Uso:
 *   const supabase = await createClient();
 *   const { data } = await supabase.from("...").select();
 */
export async function createClient() {
  // Next.js 15+: cookies() passou a ser assíncrono.
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Chamado a partir de um Server Component sem contexto de
            // resposta mutável — ignorado com segurança quando o
            // middleware já é responsável por atualizar a sessão.
          }
        },
      },
    }
  );
}

/**
 * Cliente Supabase para módulos de dados de negócio (clientes, produtos,
 * vendas, financeiro etc.): usa o client Clerk-aware (token JWT do Clerk
 * via Third-Party Auth) quando isClerkEnabled, e o client Supabase Auth por
 * cookie (createClient acima) no fallback sem Clerk — mesmo padrão já
 * usado em companies/queries.ts e auth/session.ts desde a Fase 5B-APP.
 *
 * Existe para não repetir a ramificação `isClerkEnabled ? ... : ...` em
 * cada um dos ~35 módulos de `src/lib/*` que só leem/escrevem dados sob
 * RLS (nunca para os fluxos do próprio Supabase Auth como login/registro,
 * que devem continuar em createClient() puro).
 */
export async function createSessionClient() {
  return isClerkEnabled ? createClerkSupabaseClient() : await createClient();
}
