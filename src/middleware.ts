import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSubscriptionGuardStatus } from "@/lib/billing/guard";
import { getPlatformAdminGuardStatus, isPlatformAdminRole } from "@/lib/admin/guard";
import type { UserRole } from "@/types/profile";
import {
  AUTH_BACKEND_MESSAGES,
  readJwtRole,
  type AuthBackendErrorCode,
} from "@/lib/auth/token-claims";

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

/** Resposta 503 (fail closed) quando a autenticação no banco está indisponível/mal configurada. */
function authBackendUnavailable(code: AuthBackendErrorCode) {
  const message = AUTH_BACKEND_MESSAGES[code];
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Serviço indisponível</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Serviço de autenticação indisponível</h1><p>${message}</p></body></html>`,
    {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    }
  );
}

/**
 * Middleware raiz da aplicação (Clerk é a única autenticação).
 *
 * 1. Bloqueia /app, /admin e /onboarding para quem não tem sessão Clerk,
 *    redirecionando para /login.
 * 2. Evita que um usuário já autenticado veja /login ou /register.
 * 3. Em /admin e /admin/*, além de autenticado, exige profiles.role igual a
 *    "admin" ou "super_admin" — nunca company_members.role. Qualquer falha
 *    ao confirmar a role nega o acesso (fail closed).
 * 4. Guard de assinatura (/app/*, exceto /app/assinatura).
 *
 * Os guards de role/assinatura leem o banco com o token da própria sessão
 * Clerk (Third-Party Auth do Supabase), então rodam sob as mesmas políticas
 * RLS do restante do app: profiles_select_own devolve só o perfil do
 * usuário atual, o que dá o UUID interno (profiles.user_id) e a role numa
 * única consulta.
 */
export const middleware = clerkMiddleware(async (auth, request) => {
  const { userId, getToken } = await auth();
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(userId);

  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  const needsAdminGuard = isAuthenticated && isAdminRoute(pathname);
  const needsSubscriptionGuard = isAuthenticated && requiresActiveSubscription(pathname);

  if (!needsAdminGuard && !needsSubscriptionGuard) {
    return NextResponse.next();
  }

  const token = await getToken();

  // Sem role=authenticated no token, o PostgREST roda como `anon`: o SELECT em
  // profiles devolve 200 vazio (RLS) e pareceria "primeiro acesso". Isso é
  // erro de configuração do Clerk, não ausência de perfil.
  if (token && readJwtRole(token) !== "authenticated") {
    return authBackendUnavailable("AUTH_ROLE_MISSING");
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => token }
  );

  const { data: profile, error: profileError } = token
    ? await supabase.from("profiles").select("user_id, role").maybeSingle()
    : { data: null, error: null };

  // Erro do Supabase (401/5xx...) não é "sem perfil": não segue para o onboarding.
  if (profileError) {
    console.error("[middleware] leitura de profiles falhou:", profileError.message);
    return authBackendUnavailable("AUTH_RPC_FAILED");
  }

  if (needsAdminGuard) {
    const isPlatformAdmin = isPlatformAdminRole(profile?.role as UserRole | undefined);
    if (!profile || !isPlatformAdmin) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    // Reconfirma pelo guard central (mesma regra usada em todo o projeto).
    const guard = await getPlatformAdminGuardStatus(supabase, profile.user_id);
    if (!guard.isPlatformAdmin) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  // Sem perfil ainda = primeiro acesso: o onboarding cria perfil e empresa.
  if (needsSubscriptionGuard && profile) {
    const { hasCompany, isActive } = await getSubscriptionGuardStatus(supabase, profile.user_id);
    if (hasCompany && !isActive) {
      return NextResponse.redirect(new URL("/app/assinatura", request.url));
    }
  }

  return NextResponse.next();
});

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
