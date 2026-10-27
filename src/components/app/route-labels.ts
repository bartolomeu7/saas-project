/**
 * Breadcrumb da área autenticada (/app), derivado da rota — mesmo padrão do header do admin (`ADMIN_ROUTE_LABELS`).
 *
 * Função pura (sem React nem aliases) para poder ser testada em Node. Regras:
 * - o primeiro item é o módulo do menu lateral (rótulo vem de `nav-items.ts`, nunca duplicado aqui);
 * - segmentos conhecidos (novo, editar, categorias…) têm rótulo fixo; qualquer outro segmento é um identificador
 *   dinâmico e vira "Detalhes" — nunca exibimos o id na tela;
 * - um item só é link se o caminho acumulado for uma página que existe (`APP_ROUTE_PATTERNS`); caso contrário é
 *   texto, para o breadcrumb nunca apontar para um 404. O teste `app-breadcrumbs.test.mjs` confere a lista com o
 *   sistema de arquivos.
 */

export interface BreadcrumbModule {
  label: string;
  href: string;
}

export interface AppCrumb {
  label: string;
  /** Presente só quando o item é um link válido; o último item (página atual) nunca tem href. */
  href?: string;
}

/** Páginas existentes em `src/app/(app)/app`, com `[id]` no lugar dos identificadores. */
export const APP_ROUTE_PATTERNS: readonly string[] = [
  "/app",
  "/app/agenda",
  "/app/assinatura",
  "/app/assinatura/historico",
  "/app/assinatura/pagamento/[id]",
  "/app/assinatura/planos",
  "/app/caixa",
  "/app/clientes",
  "/app/clientes/[id]",
  "/app/clientes/[id]/editar",
  "/app/clientes/novo",
  "/app/clientes/ranking",
  "/app/clientes/sorteio",
  "/app/clientes/sorteio/[id]",
  "/app/compras",
  "/app/compras/[id]",
  "/app/compras/nova",
  "/app/equipe",
  "/app/equipe/[id]",
  "/app/estoque",
  "/app/fidelidade",
  "/app/financeiro",
  "/app/fornecedores",
  "/app/fornecedores/[id]",
  "/app/fornecedores/novo",
  "/app/produtos",
  "/app/produtos/[id]",
  "/app/produtos/[id]/editar",
  "/app/produtos/categorias",
  "/app/produtos/categorias/[id]/editar",
  "/app/produtos/categorias/nova",
  "/app/produtos/novo",
  "/app/relatorios",
  "/app/servicos",
  "/app/servicos/[id]",
  "/app/servicos/[id]/editar",
  "/app/servicos/categorias",
  "/app/servicos/categorias/[id]/editar",
  "/app/servicos/categorias/nova",
  "/app/servicos/novo",
  "/app/vendas",
  "/app/vendas/[id]",
  "/app/vendas/nova",
];

const SEGMENT_LABELS: Record<string, string> = {
  novo: "Novo",
  nova: "Nova",
  editar: "Editar",
  categorias: "Categorias",
  ranking: "Ranking",
  sorteio: "Sorteio",
  historico: "Histórico",
  planos: "Planos",
  pagamento: "Pagamento",
};

const DYNAMIC_LABEL = "Detalhes";

function patternMatches(pattern: string, path: string): boolean {
  const p = pattern.split("/");
  const s = path.split("/");
  return p.length === s.length && p.every((part, i) => part === "[id]" || part === s[i]);
}

export function isKnownAppRoute(path: string): boolean {
  return APP_ROUTE_PATTERNS.some((pattern) => patternMatches(pattern, path));
}

/** Retorna [] quando a rota não pertence a nenhum módulo do menu (o header então não mostra breadcrumb). */
export function buildAppBreadcrumbs(pathname: string, modules: readonly BreadcrumbModule[]): AppCrumb[] {
  const path = pathname.replace(/\/+$/, "") || "/";

  const root = modules.find((m) => m.href === "/app");
  if (path === "/app") return root ? [{ label: root.label }] : [];

  // Módulo = maior prefixo do menu que contém a rota (exceto o próprio "/app").
  const owner = modules
    .filter((m) => m.href !== "/app" && (path === m.href || path.startsWith(`${m.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!owner) return [];

  const crumbs: AppCrumb[] = [{ label: owner.label, href: owner.href }];
  const rest = path.slice(owner.href.length).split("/").filter(Boolean);

  let acc = owner.href;
  for (const segment of rest) {
    acc = `${acc}/${segment}`;
    crumbs.push({ label: SEGMENT_LABELS[segment] ?? DYNAMIC_LABEL, href: isKnownAppRoute(acc) ? acc : undefined });
  }

  // A página atual não é link.
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}
