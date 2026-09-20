import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

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
 *   const supabase = createClient();
 *   const { data } = await supabase.from("...").select();
 */
export function createClient() {
  const cookieStore = cookies();

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
