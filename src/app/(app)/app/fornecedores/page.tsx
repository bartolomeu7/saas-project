import type { Metadata } from "next";
import Link from "next/link";
import { Search, Store, UserCheck, UserX, Users } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ListAvatar, ListToolbar } from "@/components/app/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listSuppliers, getSupplierStats } from "@/lib/suppliers/queries";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function SuppliersPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  const [stats, suppliers] = await Promise.all([
    getSupplierStats(current.company.id),
    listSuppliers(current.company.id, searchParams?.q),
  ]);
  const searching = Boolean(searchParams?.q);

  return (
    <div className="prime-module-page prime-module-page--fornecedores flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Fornecedores"
        description="Cadastre parceiros, custos e vínculos que alimentarão Compras e Estoque."
        actions={
          <Link href="/app/fornecedores/novo" className={cn(buttonVariants())}>
            + Novo fornecedor
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Total" value={stats.total} icon={Users} />
        <MetricCard label="Ativos" value={stats.active} icon={UserCheck} />
        <MetricCard label="Inativos" value={stats.inactive} icon={UserX} />
      </div>

      {stats.total === 0 && !searching ? (
        <EmptyState
          title="Você ainda não possui fornecedores."
          description="Cadastre o primeiro para criar pedidos de compra e dar entrada no estoque."
          actionLabel="Novo fornecedor"
          actionHref="/app/fornecedores/novo"
          icon={Store}
        />
      ) : (
        <>
          <ListToolbar>
            <form className="flex w-full items-center gap-2 sm:max-w-md" role="search">
              <div className="relative w-full">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  name="q"
                  type="search"
                  defaultValue={searchParams?.q ?? ""}
                  aria-label="Buscar fornecedores"
                  placeholder="Buscar fornecedor..."
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button className={cn(buttonVariants({ variant: "outline" }))}>Buscar</button>
            </form>
          </ListToolbar>

          {suppliers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum fornecedor encontrado.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {suppliers.length} {suppliers.length === 1 ? "fornecedor" : "fornecedores"}
              </p>
              <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
                <Table className="w-full text-sm">
                  <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <TableRow>
                      <TableHead className="px-4 py-3 font-semibold">Fornecedor</TableHead>
                      <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Documento</TableHead>
                      <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Contato</TableHead>
                      <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((s) => (
                      <TableRow key={s.id} className="hover:bg-secondary/30">
                        <TableCell className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ListAvatar>{s.name.trim().slice(0, 1).toUpperCase()}</ListAvatar>
                            <div className="min-w-0">
                              <Link
                                className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                                href={`/app/fornecedores/${s.id}`}
                              >
                                {s.name}
                              </Link>
                              <span className="block truncate text-xs text-muted-foreground">
                                {s.legal_name || s.phone || s.email || ""}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">{s.document || "—"}</TableCell>
                        <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{s.phone || s.email || "—"}</TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant={s.status === "active" ? "success" : "muted"}>
                            {s.status === "active" ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
