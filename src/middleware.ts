import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getSubscriptionGuardStatus } from "@/lib/billing/guard";
import { getPlatformAdminGuardStatus } from "@/lib/admin/guard";
import { isClerkEnabled } from "@/lib/clerk/config";

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
 *    está autenticado (Supabase Auth OU Clerk — ver `clerkUserId`),
 *    redirecionando para /login.
 * 3. Evita que um usuário já autenticado veja /login ou /register.
 * 4. Em /admin e /admin/*, além de autenticado, exige
 *    profiles.role igual a "admin" ou "super_admin" — nunca
 *    company_members.role. Quem não atende é levado de volta a /app.
 * 5. Guard de assinatura (/app/*, exceto /app/assinatura).
 *
 * Fase 5B-APP: os guards de admin/assinatura leem `profiles`/`subscriptions`
 * sob as MESMAS 88 RLS policies de sempre (auth.uid()), usando o client
 * Supabase Auth de `updateSession`. Uma sessão Clerk não tem esse client
 * autenticado (não criamos mais sessão Supabase Auth), então essas duas
 * consultas não têm como rodar para ela ainda — por isso, com Clerk:
 *   - /admin FALHA FECHADO (nunca libera sem o check rodar de verdade —
 *     ver isAdminRoute abaixo, redireciona sempre até a Migration E/F
 *     trazer um jeito real de checar role com token Clerk);
 *   - o guard de assinatura é pulado (não bloqueia) — é enforcement de
 *     billing, não de segurança, aceitável não rodar nesta fase de
 *     transição, como a missão autorizou.
 * Nenhuma RLS/RPC foi alterada para viabilizar isso.
 */
async function coreMiddleware(request: NextRequest, clerkUserId: string | null) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(user) || Boolean(clerkUserId);
  const isClerkOnlySession = Boolean(clerkUserId) && !user;

  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (isAuthenticated && isAdminRoute(pathname)) {
    // Sessão só-Clerk: sem RLS migrada ainda não há como confirmar
    // profiles.role via este client — nega por padrão (fail closed) em vez
    // de pular o check (o que liberaria /admin sem verificação nenhuma).
    if (isClerkOnlySession) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    const { isPlatformAdmin } = await getPlatformAdminGuardStatus(supabase, user!.id);
    if (!isPlatformAdmin) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  if (isAuthenticated && !isClerkOnlySession && requiresActiveSubscription(pathname)) {
    const { hasCompany, isActive } = await getSubscriptionGuardStatus(supabase, user!.id);
    if (hasCompany && !isActive) {
      return NextResponse.redirect(new URL("/app/assinatura", request.url));
    }
  }

  return response;
}

/**
 * Fase 2: sem chaves Clerk Development, middleware idêntico ao original
 * (Supabase Auth decide tudo). Fase 5B-APP: com as chaves presentes,
 * clerkMiddleware dá acesso a `auth()` para reconhecer sessão Clerk também
 * como "autenticado" nos guards acima — REUSE FIRST, mesma função
 * `coreMiddleware`, só o sinal de autenticação passa a considerar as duas
 * fontes.
 */
export const middleware = isClerkEnabled
  ? clerkMiddleware(async (auth, request) => {
      const { userId } = await auth();
      return coreMiddleware(request, userId ?? null);
    })
  : (request: NextRequest) => coreMiddleware(request, null);

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
