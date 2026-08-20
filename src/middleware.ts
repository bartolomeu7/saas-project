import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Middleware raiz da aplicação.
 *
 * Nesta etapa da fundação, apenas mantém a sessão Supabase atualizada
 * em cada request. A proteção de rotas por papel (cliente vs. admin)
 * será adicionada na etapa de autenticação/autorização, quando as
 * rotas (app) e (admin) tiverem regras de acesso definidas.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas, exceto:
     * - arquivos estáticos e de imagem
     * - favicon
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
