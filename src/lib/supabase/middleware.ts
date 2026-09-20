import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

/**
 * Atualiza a sessão Supabase a cada request (renova o token quando
 * necessário) e devolve a response já com os cookies atualizados, além
 * do usuário autenticado atual (ou null).
 *
 * Padrão `getAll`/`setAll` (ver src/lib/supabase/server.ts para a
 * justificativa completa da migração a partir de `get`/`set`/`remove`).
 * Autorização por role (/admin) e por assinatura (/app) já são aplicadas
 * em src/middleware.ts, que usa o `user`/`supabase` devolvidos aqui.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Precisa ser espelhado tanto na request (para que o restante
          // deste mesmo ciclo de middleware enxergue o cookie atualizado)
          // quanto na response (para que o navegador realmente o receba).
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Necessário para manter o token de sessão atualizado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Devolve também o client (não só response/user) para o middleware
  // reaproveitar na consulta do guard de assinatura, em vez de criar um
  // segundo client Supabase por request.
  return { response, user, supabase };
}
