import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSubscriptionGuardStatus } from "@/lib/billing/guard";
import { isActivePlatformAdmin, isActiveSuperAdmin } from "@/lib/admin/permissions";
import { ACCOUNT_BLOCKED_PATH } from "@/lib/auth/account-status";
import type { UserRole, UserStatus } from "@/types/profile";
import { CONSENT_REQUIRED_CODE, decideConsentGate, isConsentGatedPath } from "@/lib/legal/gate";
import { safeAfterConsentPath } from "@/lib/legal/safe-path";
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
 * autenticação, profiles.role "admin" ou "super_admin" COM status "active"
 * (nunca company_members.role; ver src/lib/admin/guard.ts e permissions.ts).
 */
const ADMIN_PREFIX = "/admin";

/**
 * Seções do /admin exclusivas de super_admin (administradores e configurações
 * críticas). Admin comum é redirecionado para o dashboard do painel. É só a
 * primeira camada: as páginas e as RPCs repetem a checagem no servidor/banco.
 */
const SUPER_ADMIN_ONLY_PREFIXES = ["/admin/administrators", "/admin/settings"];

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

function isAppRoute(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isOnboardingRoute(pathname: string) {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

function isSuperAdminOnlyRoute(pathname: string) {
  return SUPER_ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Cliente tipado só para a RPC de consentimento (ela ainda não está no types/supabase.ts gerado). */
type ConsentRpcClient = {
  rpc(fn: "get_my_legal_consent_status"): Promise<{
    data: { complete?: unknown } | null;
    error: { message: string } | null;
  }>;
};

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
 * 5. profiles.status: conta inactive/suspended não acessa /app, /onboarding nem
 *    /admin — é redirecionada para ACCOUNT_BLOCKED_PATH (a mesma regra vale no
 *    banco: current_profile_user_id() só reconhece perfil ativo).
 * 6. Consentimento legal vigente (Termos + Política): barreira CENTRAL para páginas, Server
 *    Actions e APIs do usuário (ver src/lib/legal/gate.ts). Páginas redirecionam para
 *    /aceite-termos; Server Actions/APIs/POST recebem 403 LEGAL_CONSENT_REQUIRED. Se o banco não
 *    responder, falha FECHADO (503). Quem ainda não tem perfil (primeiro acesso) passa: o layout cria o
 *    perfil e o próprio layout/onboarding repetem a checagem.
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

  // profiles.status vale para TODO o produto autenticado: /app (inclusive
  // /app/assinatura), /onboarding e /admin. Uma única leitura do perfil serve
  // aos três guards (status, admin e assinatura).
  const needsStatusGuard =
    isAuthenticated && (isAppRoute(pathname) || isOnboardingRoute(pathname) || isAdminRoute(pathname));
  const needsConsentGate = isAuthenticated && isConsentGatedPath(pathname);
  const isApiRoute = pathname.startsWith("/api/");

  if (!needsStatusGuard && !needsConsentGate) {
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
    ? await supabase.from("profiles").select("user_id, role, status").maybeSingle()
    : { data: null, error: null };

  // Erro do Supabase (401/5xx...) não é "sem perfil": não segue para o onboarding.
  if (profileError) {
    console.error("[middleware] leitura de profiles falhou:", profileError.message);
    return authBackendUnavailable("AUTH_RPC_FAILED");
  }

  // Conta inativa ou suspensa: sem produto e sem painel, qualquer que seja o papel.
  // Perfil inexistente = primeiro acesso (segue para o onboarding, que o cria).
  // O Clerk só prova a identidade; quem libera o acesso é profiles.status.
  if (profile && profile.status !== "active") {
    // APIs (billing/presença) tratam a conta inativa por conta própria (AccountInactiveError => 403).
    if (isApiRoute) return NextResponse.next();
    return NextResponse.redirect(new URL(ACCOUNT_BLOCKED_PATH, request.url));
  }

  if (needsAdminGuard) {
    const role = profile?.role as UserRole | undefined;
    const status = profile?.status as UserStatus | undefined;

    // Mesma regra do banco (is_platform_admin()): role admin|super_admin E status
    // active. Admin/super_admin suspenso ou inativo não entra — fail closed.
    if (!profile || !isActivePlatformAdmin(role, status)) {
      return NextResponse.redirect(new URL("/app", request.url));
    }

    // Seções exclusivas de super_admin: admin comum volta para o dashboard do painel.
    if (isSuperAdminOnlyRoute(pathname) && !isActiveSuperAdmin(role, status)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  // Consentimento legal vigente: sem ele nenhuma ação do produto passa, por nenhum caminho HTTP.
  if (needsConsentGate && profile) {
    const { data: consent, error: consentError } = await (supabase as unknown as ConsentRpcClient).rpc(
      "get_my_legal_consent_status"
    );
    if (consentError) {
      console.error("[middleware] verificação de consentimento falhou:", consentError.message);
      return authBackendUnavailable("AUTH_RPC_FAILED");
    }
    const decision = decideConsentGate({
      pathname,
      search: request.nextUrl.search,
      method: request.method,
      isServerAction: request.headers.has("next-action"),
      complete: consent?.complete,
    });
    if (decision.action === "redirect") {
      const target = `/aceite-termos?next=${encodeURIComponent(safeAfterConsentPath(decision.from))}`;
      return NextResponse.redirect(new URL(target, request.url));
    }
    if (decision.action === "deny") {
      return NextResponse.json(
        { error: "Aceite os Termos de Uso e a Política de Privacidade vigentes para continuar.", code: CONSENT_REQUIRED_CODE },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
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
