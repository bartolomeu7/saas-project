import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, PackageX, Package } from "lucide-react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ListAvatar } from "@/components/app/list-toolbar";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listProducts } from "@/lib/products/queries";
import { listRecentStockMovements } from "@/lib/products/stock-movements";
import { formatStockDelta, stockMovementDelta, stockSourceLabel } from "@/lib/products/stock-labels";
import { formatDateTime } from "@/lib/format";
import type { StockLevel } from "@/types/product";
import { getStockLevel } from "@/types/product";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Estoque" };

const LEVEL_FILTERS: Array<{ value: "" | StockLevel; label: string }> = [
  { value: "", label: "Todos" },
  { value: "out", label: "Sem estoque" },
  { value: "low", label: "Estoque baixo" },
  { value: "normal", label: "Normal" },
];
const LIST_LIMIT = 50;

export default async function StockPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ q?: string; nivel?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  const search = (searchParams?.q ?? "").slice(0, 80);
  const levelFilter = (LEVEL_FILTERS.find((item) => item.value === searchParams?.nivel)?.value ?? "") as "" | StockLevel;
  const [result, listed, movements] = await Promise.all([
    listProducts({ companyId: current.company.id, status: "active", pageSize: 1000, sortBy: "stock", sortDirection: "asc" }),
    listProducts({ companyId: current.company.id, status: "active", search, stockLevel: levelFilter || "all", pageSize: LIST_LIMIT, sortBy: "name" }),
    listRecentStockMovements(current.company.id, 30),
  ]);
  const products = result.products;
  const out = products.filter((p) => getStockLevel(p) === "out");
  const low = products.filter((p) => getStockLevel(p) === "low");
  const normal = products.filter((p) => getStockLevel(p) === "normal");
  const attention = [...out, ...low];

  return (
    <div className="prime-module-page prime-module-page--estoque flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Estoque"
        description="Visão operacional do saldo, alertas e ajustes de produtos."
        actions={
          <Link href="/app/produtos" className={cn(buttonVariants({ variant: "outline" }))}>
            Gerenciar produtos
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Sem estoque" value={out.length} icon={PackageX} />
        <MetricCard label="Estoque baixo" value={low.length} icon={AlertTriangle} />
        <MetricCard label="Normal" value={normal.length} icon={CheckCircle2} />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card/40" aria-labelledby="estoque-atencao">
        <div className="border-b border-border bg-secondary/40 p-4">
          <h2 id="estoque-atencao" className="font-semibold">
            Produtos que precisam de atenção
          </h2>
          {attention.length > 20 && (
            <p className="mt-0.5 text-xs text-muted-foreground">Mostrando os 20 primeiros de {attention.length}.</p>
          )}
        </div>
        <ul className="divide-y divide-border">
          {attention.slice(0, 20).map((p) => {
            const level = getStockLevel(p);
            const minimum = Number(p.minimum_stock) || 0;
            const ratio = minimum > 0 ? Math.max(0, Math.min(100, (Number(p.stock_quantity) / minimum) * 100)) : 0;
            return (
              <li key={p.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                <ListAvatar className={level === "out" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}>
                  <Package className="h-4 w-4" strokeWidth={1.75} />
                </ListAvatar>
                <div className="min-w-0 flex-1">
                  <Link href={`/app/produtos/${p.id}`} className="block truncate font-medium hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Atual: {p.stock_quantity} · Mínimo: {p.minimum_stock}
                  </p>
                  {minimum > 0 && (
                    <div className="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                      <div
                        className={cn("h-full rounded-full", level === "out" ? "bg-destructive" : "bg-warning")}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  )}
                </div>
                <Badge variant={level === "out" ? "danger" : "warning"}>{level === "out" ? "Sem estoque" : "Estoque baixo"}</Badge>
              </li>
            );
          })}
        </ul>
        {attention.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
            Nenhum alerta de estoque. Operação saudável.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card/40" aria-labelledby="estoque-lista">
        <div className="flex flex-col gap-3 border-b border-border bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="estoque-lista" className="font-semibold">Saldo por produto</h2>
          <form className="flex w-full flex-wrap items-center gap-2 sm:max-w-xl" role="search">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                name="q"
                type="search"
                defaultValue={search}
                aria-label="Buscar produto no estoque"
                placeholder="Buscar produto, SKU ou código..."
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <select
              name="nivel"
              defaultValue={levelFilter}
              aria-label="Filtrar por nível de estoque"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {LEVEL_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <button className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Filtrar</button>
          </form>
        </div>
        {listed.products.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado com esse filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Atual</th>
                  <th className="px-3 py-2 text-right font-medium">Mínimo</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {listed.products.map((p) => {
                  const level = getStockLevel(p);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <Link href={`/app/produtos/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                        {p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.stock_quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.minimum_stock}</td>
                      <td className="px-4 py-2">
                        <Badge variant={level === "out" ? "danger" : level === "low" ? "warning" : "success"}>
                          {level === "out" ? "Sem estoque" : level === "low" ? "Estoque baixo" : "Normal"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {listed.total > LIST_LIMIT && (
          <p className="border-t border-border p-3 text-xs text-muted-foreground">
            Mostrando {LIST_LIMIT} de {listed.total} produtos. Use a busca para achar o restante.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card/40" aria-labelledby="estoque-movimentos">
        <div className="border-b border-border bg-secondary/40 p-4">
          <h2 id="estoque-movimentos" className="font-semibold">Últimas movimentações</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Entradas, saídas e ajustes, com o saldo antes e depois.</p>
        </div>
        {movements.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Ainda não há movimentações de estoque.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 text-right font-medium">Variação</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const delta = stockMovementDelta(m);
                  return (
                    <tr key={m.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatDateTime(m.created_at)}</td>
                      <td className="px-3 py-2"><Link href={`/app/produtos/${m.product_id}`} className="hover:underline">{m.product_name}</Link></td>
                      <td className="px-3 py-2">{stockSourceLabel(m.source)}</td>
                      <td className={cn("px-3 py-2 text-right font-medium tabular-nums", delta > 0 ? "text-emerald-600 dark:text-emerald-500" : delta < 0 ? "text-destructive" : "")}>{formatStockDelta(delta)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{m.stock_before} → {m.stock_after}</td>
                      <td className="max-w-[16rem] truncate px-4 py-2 text-muted-foreground" title={m.reason}>{m.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="font-semibold">Entrada de mercadoria</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Receba os pedidos em{" "}
          <Link href="/app/compras" className="underline">
            Compras
          </Link>
          : o recebimento dá entrada no estoque e gera a conta a pagar.
        </p>
      </div>
    </div>
  );
}
