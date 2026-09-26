import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
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
  const out = products.filter(p => getStockLevel(p) === "out");
  const low = products.filter(p => getStockLevel(p) === "low");
  const normal = products.filter(p => getStockLevel(p) === "normal");
  return (
    <div className="prime-module-page prime-module-page--estoque flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Estoque</h1><p className="text-sm text-muted-foreground">Visão operacional do saldo, alertas e ajustes de produtos.</p></div><Link href="/app/produtos" className={cn(buttonVariants({variant:"outline"}))}>Gerenciar produtos</Link></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><MetricCard label="Sem estoque" value={out.length} /><MetricCard label="Estoque baixo" value={low.length} /><MetricCard label="Normal" value={normal.length} /></div>
      <div className="rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Produtos que precisam de atenção</h2></div><div className="divide-y">{[...out,...low].slice(0,20).map(p => <div key={p.id} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"><div><Link href={`/app/produtos/${p.id}`} className="font-medium hover:underline">{p.name}</Link><p className="text-xs text-muted-foreground">Atual: {p.stock_quantity} · Mínimo: {p.minimum_stock}</p></div><Badge variant={getStockLevel(p)==="out" ? "danger" : "warning"}>{getStockLevel(p)==="out" ? "Sem estoque" : "Estoque baixo"}</Badge></div>)}</div>{out.length+low.length===0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhum alerta de estoque. Operação saudável.</div>}</div>
      <div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Entrada de mercadoria</h2><p className="mt-1 text-sm text-muted-foreground">Receba os pedidos em <Link href="/app/compras" className="underline">Compras</Link>: o recebimento dá entrada no estoque e gera a conta a pagar.</p></div>
    </div>
  );
}