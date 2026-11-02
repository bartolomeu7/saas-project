import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, PackageX, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ListAvatar } from "@/components/app/list-toolbar";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listProducts } from "@/lib/products/queries";
import { getStockLevel } from "@/types/product";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Estoque" };

export default async function StockPage() {
  const current = (await getCurrentCompany())!;
  const result = await listProducts({ companyId: current.company.id, status: "active", pageSize: 1000, sortBy: "stock", sortDirection: "asc" });
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
