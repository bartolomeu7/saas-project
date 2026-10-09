import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseSearch, type SearchParams } from "@/lib/admin/params";
import { getEnvironmentChecks } from "@/lib/admin/environment";
import { getPlatformDiagnostics, requirePlatformAdmin, searchPlatform } from "@/lib/admin/queries";
import type { SearchHit } from "@/types/admin";
import { ToolsQuickActions } from "./quick-actions";

export const metadata = { title: "Ferramentas" };

const KIND_LABELS: Record<SearchHit["kind"], string> = {
  user: "Usuários",
  company: "Empresas",
  payment: "Pagamentos",
};

function hitHref(hit: SearchHit): string {
  return hit.kind === "user"
    ? `/admin/users/${hit.id}`
    : hit.kind === "company"
      ? `/admin/companies/${hit.id}`
      : `/admin/payments/${hit.id}`;
}

const SEVERITY_VARIANTS = { ok: "success", warn: "warning", error: "danger" } as const;
const SEVERITY_LABELS = { ok: "OK", warn: "Atenção", error: "Problema" } as const;

/**
 * Ferramentas do administrador: busca global (usuário, empresa, pagamento),
 * diagnósticos de consistência (somente leitura, calculados no banco), ações rápidas
 * seguras e a checagem de configuração do ambiente (só mostra se cada variável
 * existe — nunca o valor).
 */
export default async function AdminToolsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;
  const query = parseSearch(searchParams.q);

  const [hits, diagnostics] = await Promise.all([
    query && query.length >= 2 ? searchPlatform(query) : Promise.resolve([] as SearchHit[]),
    getPlatformDiagnostics(),
  ]);
  const environment = getEnvironmentChecks();
  const staleCount = diagnostics.find((check) => check.check_key === "subscriptions_stale_status")?.affected ?? 0;
  const grouped = (["user", "company", "payment"] as const).map((kind) => ({
    kind,
    items: hits.filter((hit) => hit.kind === kind),
  }));

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Ferramentas"
        description="Busca global, diagnósticos de consistência e ações rápidas seguras."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Busca global</CardTitle>
          <CardDescription>Encontre usuários (nome/e-mail), empresas (nome/dono) e pagamentos (referência/ID).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" action="/admin/tools" role="search" className="flex gap-2">
            <label htmlFor="tools-q" className="sr-only">
              Buscar
            </label>
            <Input id="tools-q" name="q" defaultValue={query} placeholder="Digite ao menos 2 caracteres" maxLength={80} autoComplete="off" />
            <Button type="submit" className="gap-1.5">
              <Search className="size-4" strokeWidth={1.75} aria-hidden="true" /> Buscar
            </Button>
          </form>

          {query && query.length < 2 && <p className="text-sm text-muted-foreground">Digite ao menos 2 caracteres.</p>}
          {query && query.length >= 2 && hits.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada encontrado para “{query}”.</p>
          )}
          {hits.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {grouped.map(({ kind, items }) => (
                <div key={kind} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    {KIND_LABELS[kind]} <span className="text-muted-foreground">({items.length})</span>
                  </h3>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum resultado.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {items.map((hit) => (
                        <li key={hit.id}>
                          <Link
                            href={hitHref(hit)}
                            className="flex flex-col rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                          >
                            <span className="truncate font-medium text-foreground">{hit.title ?? "Sem nome"}</span>
                            {hit.subtitle && <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span>}
                            {hit.extra && <span className="truncate text-xs text-muted-foreground">{hit.extra}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diagnósticos</CardTitle>
          <CardDescription>Verificações de consistência calculadas agora, direto no banco (somente leitura).</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-border">
            {diagnostics.map((check) => (
              <li key={check.check_key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{check.label}</p>
                  {check.severity !== "ok" && <p className="text-xs text-muted-foreground">{check.hint}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {check.severity !== "ok" && <span className="text-sm tabular-nums text-foreground">{check.affected}</span>}
                  <Badge variant={SEVERITY_VARIANTS[check.severity]}>{SEVERITY_LABELS[check.severity]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações rápidas</CardTitle>
          <CardDescription>Operações seguras e repetíveis. Sincronizar entitlements está na página de cada empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToolsQuickActions staleCount={staleCount} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração do ambiente</CardTitle>
          <CardDescription>Apenas se cada variável está definida neste deploy. Valores nunca são exibidos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {environment.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{item.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.detail && <span className="text-xs text-muted-foreground">{item.detail}</span>}
                  <Badge variant={item.configured ? "success" : "danger"}>{item.configured ? "Definida" : "Ausente"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
