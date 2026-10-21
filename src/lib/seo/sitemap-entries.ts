/**
 * Monta as entradas do sitemap.xml a partir de uma lista de páginas. Módulo PURO (sem imports): testável direto no Node.
 *
 * Garantias:
 *  - só entra página marcada como indexável;
 *  - nunca entra rota privada, administrativa, de API, de login/cadastro ou telas funcionais (lança erro: é bug de quem chamou);
 *  - URLs absolutas a partir de UMA origem, sem duplicatas;
 *  - `lastModified` só aparece quando a data é REAL e válida (AAAA-MM-DD); sem data confiável, o campo é omitido
 *    (nunca "agora"); `changefreq` e `priority` não são usados (o Google os ignora).
 */
export interface SitemapPageInput {
  /** Caminho absoluto do site, ex.: "/" ou "/termos-de-uso". Sem query nem hash. */
  path: string;
  /** Data da última alteração REAL do conteúdo (AAAA-MM-DD). Omita se não houver fonte confiável. */
  lastModified?: string | null;
  /** false = a página existe mas ainda não deve ser indexada (ex.: conteúdo provisório). Padrão: true. */
  indexable?: boolean;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
}

/** Rotas que NUNCA podem aparecer no sitemap (a própria rota e tudo abaixo dela). */
export const SITEMAP_FORBIDDEN_ROUTES = [
  "/app",
  "/admin",
  "/onboarding",
  "/conta",
  "/conta-excluida",
  "/api",
  "/auth",
  "/login",
  "/register",
  "/aceite-termos",
  "/forgot-password",
  "/reset-password",
] as const;
/** Prefixos de nome (ex.: /acesso-sessoes, /acesso-indisponivel). */
export const SITEMAP_FORBIDDEN_NAME_PREFIXES = ["/acesso-"] as const;

function isForbidden(path: string): boolean {
  return (
    SITEMAP_FORBIDDEN_ROUTES.some((route) => path === route || path.startsWith(route + "/")) ||
    SITEMAP_FORBIDDEN_NAME_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildSitemapEntries(origin: string, pages: readonly SitemapPageInput[]): SitemapEntry[] {
  const base = origin.replace(/\/+$/, "");
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];

  for (const page of pages) {
    if (page.indexable === false) continue;
    const { path } = page;
    if (!path.startsWith("/") || /[?#\s]/.test(path) || path.includes("//")) {
      throw new Error(`Caminho inválido para o sitemap: "${path}"`);
    }
    if (isForbidden(path)) {
      throw new Error(`A rota "${path}" não pode entrar no sitemap (privada, de API ou funcional).`);
    }
    const url = path === "/" ? base : base + path;
    if (seen.has(url)) continue;
    seen.add(url);
    const entry: SitemapEntry = { url };
    if (page.lastModified && isRealDate(page.lastModified)) entry.lastModified = page.lastModified;
    entries.push(entry);
  }
  return entries;
}
