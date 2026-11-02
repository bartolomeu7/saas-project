import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, CircleDollarSign, PackageCheck, PackageOpen, Truck } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ListAvatar } from "@/components/app/list-toolbar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getPurchaseStats, listPurchaseOrders } from "@/lib/purchases/queries";
import { PURCHASE_ORDER_STATUS_LABELS, type PurchaseOrderStatus } from "@/types/purchase";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Compras" };

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateOnly = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";

const STATUS_VARIANT: Record<PurchaseOrderStatus, BadgeProps["variant"]> = {
  draft: "muted",
  ordered: "info",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};

export default async function PurchasesPage() {
  const current = (await getCurrentCompany())!;
  const [stats, orders] = await Promise.all([
    getPurchaseStats(current.company.id),
    listPurchaseOrders(current.company.id),
  ]);

  return (
    <div className="prime-module-page prime-module-page--compras flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Compras"
        description="Pedido → recebimento → estoque → conta a pagar."
        actions={
          <Link href="/app/compras/nova" className={cn(buttonVariants())}>
            + Novo pedido
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Pedidos" value={String(stats.totalOrders)} icon={ClipboardList} />
        <MetricCard label="Em aberto" value={String(stats.ordered)} icon={Truck} />
        <MetricCard label="Recebimento parcial" value={String(stats.partiallyReceived)} icon={PackageOpen} />
        <MetricCard label="Recebidos" value={String(stats.received)} icon={PackageCheck} />
        <MetricCard label="A pagar" value={money(stats.openPayables)} icon={CircleDollarSign} />
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Nenhum pedido de compra ainda."
          description="Crie o primeiro para conectar compras ao estoque."
          actionLabel="Novo pedido"
          actionHref="/app/compras/nova"
          icon={ClipboardList}
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
            <Table className="w-full text-sm sm:min-w-[560px]">
              <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <TableRow>
                  <TableHead className="px-4 py-3 font-semibold">Pedido</TableHead>
                  <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Fornecedor</TableHead>
                  <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
                  <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Previsão</TableHead>
                  <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Vencimento</TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-secondary/30">
                    <TableCell className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ListAvatar>
                          <ClipboardList className="h-4 w-4" strokeWidth={1.75} />
                        </ListAvatar>
                        <div className="min-w-0">
                          <Link
                            href={"/app/compras/" + order.id}
                            className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            {order.order_number ?? "PC-" + order.id.slice(0, 8).toUpperCase()}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground md:hidden">
                            {order.suppliers?.name ?? "Sem fornecedor"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {order.suppliers?.name ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[order.status]}>{PURCHASE_ORDER_STATUS_LABELS[order.status]}</Badge>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {order.expected_at ? dateOnly(order.expected_at) : "—"}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {dateOnly(order.due_date)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium text-foreground">
                      {money(order.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
