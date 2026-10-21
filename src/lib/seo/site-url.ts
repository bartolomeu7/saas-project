/**
 * Resolução e validação do domínio público do site (canonical, sitemap, Open Graph, callbacks).
 *
 * Módulo PURO (sem imports): roda no servidor, no navegador e direto nos testes do Node.
 *
 * Regras:
 *  - Valor ausente  → usa o domínio de produção padrão (https://primeges.com.br) e SINALIZA (aviso).
 *  - Valor inválido (não é URL http/https) → erro em qualquer ambiente (não há metadado válido sem isso).
 *  - Normaliza para a ORIGEM (sem barra final, caminho, query ou hash): evita "https://x.com//termos-de-uso".
 *  - Ambiente de PRODUÇÃO (VERCEL_ENV=production ou NEXT_PUBLIC_APP_ENV=production):
 *      ERRO se for http, localhost/IP de rede interna ou um host *.vercel.app (canonical errado = indexação duplicada);
 *      AVISO se for outro domínio https diferente de primeges.com.br (pode ser mudança legítima de domínio).
 *  - PREVIEW e DESENVOLVIMENTO: nunca falham por host (localhost e *.vercel.app são normais ali); só o item "inválido" acima.
 * Nada aqui consulta rede, DNS ou a Vercel: o que continua pendente é confirmar o domínio real em produção.
 */

export const DEFAULT_PRODUCTION_URL = "https://primeges.com.br";
export const PRODUCTION_HOST = "primeges.com.br";

export type DeployKind = "production" | "preview" | "development";

export interface SiteUrlEnv {
  /** process.env.NEXT_PUBLIC_APP_URL */
  appUrl?: string | undefined;
  /** process.env.VERCEL_ENV ("production" | "preview" | "development"); só existe no servidor/build da Vercel */
  vercelEnv?: string | undefined;
  /** process.env.NEXT_PUBLIC_APP_ENV ("development" | "staging" | "production") */
  appEnv?: string | undefined;
}

export interface SiteUrlResult {
  /** Origem normalizada (sem barra final). */
  url: string;
  kind: DeployKind;
  source: "env" | "fallback";
  /** Problemas que NÃO impedem o build, mas devem aparecer no log. */
  warnings: string[];
}

export class SiteUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteUrlError";
  }
}

export function detectDeployKind(env: SiteUrlEnv): DeployKind {
  if (env.vercelEnv === "production" || env.appEnv === "production") return "production";
  if (env.vercelEnv === "preview" || env.appEnv === "staging") return "preview";
  return "development";
}

function isLoopbackOrPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "[::1]" || h === "::1") return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  return false;
}

export function resolveSiteUrl(env: SiteUrlEnv): SiteUrlResult {
  const kind = detectDeployKind(env);
  const warnings: string[] = [];
  const raw = env.appUrl?.trim();

  if (!raw) {
    warnings.push(
      `NEXT_PUBLIC_APP_URL ausente: usando o domínio padrão ${DEFAULT_PRODUCTION_URL}. Defina a variável explicitamente em Production para confirmar o domínio canônico.`
    );
    return { url: DEFAULT_PRODUCTION_URL, kind, source: "fallback", warnings };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SiteUrlError(`NEXT_PUBLIC_APP_URL inválida (não é uma URL absoluta): "${raw}". Exemplo válido: ${DEFAULT_PRODUCTION_URL}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SiteUrlError(`NEXT_PUBLIC_APP_URL precisa começar com http:// ou https:// (recebido "${parsed.protocol}").`);
  }

  const host = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    warnings.push(`NEXT_PUBLIC_APP_URL tem caminho/query/hash ("${raw}"); só a origem (${parsed.origin}) é usada.`);
  }

  if (kind === "production") {
    if (parsed.protocol !== "https:") {
      throw new SiteUrlError(`NEXT_PUBLIC_APP_URL em Production precisa ser https (recebido "${raw}").`);
    }
    if (isLoopbackOrPrivateHost(host)) {
      throw new SiteUrlError(`NEXT_PUBLIC_APP_URL em Production aponta para um host local/interno ("${host}"): canonical, sitemap e callbacks ficariam inacessíveis.`);
    }
    if (host.endsWith(".vercel.app")) {
      throw new SiteUrlError(`NEXT_PUBLIC_APP_URL em Production aponta para um domínio de preview da Vercel ("${host}"): use o domínio próprio (${PRODUCTION_HOST}).`);
    }
    if (host !== PRODUCTION_HOST) {
      warnings.push(`Domínio de Production "${host}" difere do esperado (${PRODUCTION_HOST}). Se a mudança é intencional, ajuste PRODUCTION_HOST em src/lib/seo/site-url.ts; confirme também os redirecionamentos (www/apex).`);
    }
  }

  return { url: parsed.origin, kind, source: "env", warnings };
}

/** URL absoluta de um caminho do site (`path` começa com "/"). Nunca duplica barras. */
export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  if (path === "" || path === "/") return base;
  return base + (path.startsWith("/") ? path : "/" + path);
}
