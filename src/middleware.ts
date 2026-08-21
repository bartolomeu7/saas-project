import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Prefixos de rota que exigem usuário autenticado.
 * /admin já está listado aqui para preparar a estrutura, mas ainda sem
 * verificação de role (isso será adicionado quando o painel administrativo
 * for implementado).
 */
const PROTECTED_PREFIXES = ["/app", "/admin", "/onboarding"];

/**
 * Rotas de autenticação: se o usuário já está logado, não faz sentido
 * mostrar login/cadastro novamente — redireciona para /app.
 */
const AUTH_ROUTES = ["/login", "/register"];

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.includes(pathname);
}

/**
 * Middleware raiz da aplicação.
 *
 * 1. Renova a sessão Supabase em cada request.
 * 2. Bloqueia acesso a rotas protegidas (/app, /admin) para quem não
 *    está autenticado, redirecionando para /login.
 * 3. Evita que um usuário já autenticado veja /login ou /register.
 *
 * Verificação de ROLE (ex: exigir admin para /admin) ainda não é feita
 * aqui — será adicionada junto com o painel administrativo. Nesta etapa,
 * /admin apenas exige estar autenticado, como qualquer outra rota
 * protegida.
 */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isProtectedRoute(pathname) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute(pathname) && user) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return response;
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
