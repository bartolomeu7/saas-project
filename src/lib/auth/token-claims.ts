/**
 * Leitura (sem verificar assinatura) do claim `role` do token de sessão do
 * Clerk. Serve só para diagnóstico: o Supabase (PostgREST) só troca para o
 * role `authenticated` quando o token traz `role: "authenticated"` — sem ele
 * a request roda como `anon` e as RPCs/policies de `authenticated` falham.
 *
 * Nunca loga nem devolve o token; retorna apenas o valor do claim.
 * Edge-safe (usa `atob`).
 */
export function readJwtRole(token: string | null | undefined): string | null {
  if (!token) return null;

  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

/** Códigos de falha de autenticação do lado do servidor (não é "sessão expirada"). */
export type AuthBackendErrorCode = "AUTH_ROLE_MISSING" | "AUTH_RPC_FAILED";

export const AUTH_BACKEND_MESSAGES: Record<AuthBackendErrorCode, string> = {
  AUTH_ROLE_MISSING:
    "Falha na configuração da autenticação (AUTH_ROLE_MISSING): o token de sessão não traz role=authenticated. Avise o suporte.",
  AUTH_RPC_FAILED:
    "Não foi possível validar sua conta no banco de dados (AUTH_RPC_FAILED). Tente novamente em instantes.",
};

export class AuthBackendError extends Error {
  readonly code: AuthBackendErrorCode;

  constructor(code: AuthBackendErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AuthBackendError";
    this.code = code;
  }
}
