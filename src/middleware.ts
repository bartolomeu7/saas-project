import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getSubscriptionGuardStatus } from "@/lib/billing/guard";
import { getPlatformAdminGuardStatus } from "@/lib/admin/guard";

/**
 * Prefixos de rota que exigem usuário autenticado.
 */
const PROTECTED_PREFIXES = ["/app", "/admin", "/onboarding"];

/**
 * Prefixo da área administrativa da plataforma — exige, além de
 * autenticação, profiles.role igual a "admin" ou "super_admin"
 * (nunca company_members.role; ver src/lib/admin/guard.ts).
 */
const ADMIN_PREFIX = "/admin";

/**
 * Rotas de autenticação: se o usuário já está logado, não faz sentido
 * mostrar login/cadastro novamente — redireciona para /app.
 */
const AUTH_ROUTES = ["/login", "/register"];

/**
 * Prefixo isento do guard de assinatura — é justamente onde o usuário
 * paga/renova, então precisa continuar acessível mesmo com assinatura
 * expirada.
 */
const SUBSCRIPTION_EXEMPT_PREFIX = "/app/assinatura";

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.includes(pathname);
}

function requiresActiveSubscription(pathname: string) {
  return (
    (pathname === "/app" || pathname.startsWith("/app/")) &&
    pathname !== SUBSCRIPTION_EXEMPT_PREFIX &&
    !pathname.startsWith(`${SUBSCRIPTION_EXEMPT_PREFIX}/`)
  );
}

function isAdminRoute(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

/**
 * Middleware raiz da aplicação.
 *
 * 1. Renova a sessão Supabase em cada request.
 * 2. Bloqueia acesso a rotas protegidas (/app, /admin) para quem não
 *    está autenticado, redirecionando para /login.
 * 3. Evita que um usuário já autenticado veja /login ou /register.
 * 4. Em /admin e /admin/*, além de autenticado, exige
 *    profiles.role igual a "admin" ou "super_admin" — nunca
 *    company_members.role (um owner de empresa não é administrador de
 *    plataforma só por isso). Quem não atende é levado de volta a /app;
 *    a consulta só roda para requests que batem em /admin*, sem custo
 *    para o resto do app.
 */
export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isProtectedRoute(pathname) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute(pathname) && user) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (user && isAdminRoute(pathname)) {
    const { isPlatformAdmin } = await getPlatformAdminGuardStatus(supabase, user.id);
    if (!isPlatformAdmin) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  if (user && requiresActiveSubscription(pathname)) {
    const { hasCompany, isActive } = await getSubscriptionGuardStatus(supabase, user.id);
    if (hasCompany && !isActive) {
      return NextResponse.redirect(new URL("/app/assinatura", request.url));
    }
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
