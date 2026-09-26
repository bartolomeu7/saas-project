/**
 * Origem (scheme + host) usada nos links que o Supabase Auth envia por e-mail
 * e nos redirects de OAuth (confirmação de cadastro, recuperação de senha,
 * callback). Lógica pura — a leitura dos headers fica em `actions.ts`.
 *
 * Regras:
 * - Produção (`VERCEL_ENV=production`): SEMPRE o domínio canônico
 *   (`siteConfig.url`), independente do host da request — assim links nunca
 *   dependem de header e o comportamento de produção não muda.
 * - Local e Preview: a origem real da request, para o link voltar ao mesmo
 *   ambiente que o gerou (localhost ou a URL do Preview) em vez de cair no
 *   domínio de produção.
 * - A origem só é aceita se for localhost/127.0.0.1 ou um domínio de
 *   deployment deste projeto na Vercel (`saas-project*.vercel.app`); qualquer
 *   outro host (ex.: header forjado) cai no fallback canônico. Isso evita
 *   "password reset poisoning" via Host header.
 */
export interface AppOriginInput {
  vercelEnv?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  canonical: string;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const PROJECT_PREVIEW_HOST = /^saas-project[a-z0-9-]*\.vercel\.app$/;

function firstValue(value?: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

export function resolveAppOrigin(input: AppOriginInput): string {
  if (input.vercelEnv === "production") return input.canonical;

  const host = firstValue(input.forwardedHost) || firstValue(input.host);
  if (!host) return input.canonical;

  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const isLocal = LOCAL_HOSTNAMES.has(hostname);

  if (isLocal) return `http://${host}`;
  if (PROJECT_PREVIEW_HOST.test(hostname) && !host.includes(":")) return `https://${hostname}`;

  return input.canonical;
}
