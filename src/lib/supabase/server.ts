import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

/**
 * Cliente Supabase para uso em Server Components, Route Handlers e
 * Server Actions. Usa a chave pública (anon) + cookies de sessão do
 * usuário — continua protegido pelo RLS, não pelo service role.
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
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Chamado a partir de um Server Component sem contexto de
            // resposta mutável — ignorado com segurança quando o
            // middleware já é responsável por atualizar a sessão.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Ver comentário acima.
          }
        },
      },
    }
  );
}
