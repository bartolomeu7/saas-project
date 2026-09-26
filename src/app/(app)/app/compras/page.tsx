import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getPurchaseStats, listPurchaseOrders } from "@/lib/purchases/queries";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/types/purchase";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Compras" };

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateOnly = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";

export default async function PurchasesPage() {
  const current = (await getCurrentCompany())!;
  const [stats, orders] = await Promise.all([
    getPurchaseStats(current.company.id),
    listPurchaseOrders(current.company.id),
  ]);

  return (
    <div className="prime-module-page prime-module-page--compras flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Pedido → recebimento → estoque → conta a pagar.
          </p>
        </div>
        <Link href="/app/compras/nova" className={cn(buttonVariants())}>
          + Novo pedido
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Pedidos", String(stats.totalOrders)],
          ["Em aberto", String(stats.ordered)],
          ["Recebimento parcial", String(stats.partiallyReceived)],
          ["Recebidos", String(stats.received)],
          ["A pagar", money(stats.openPayables)],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label ?? ""} value={value} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow className="border-b text-left text-muted-foreground">
              <TableHead className="p-3">Pedido</TableHead>
              <TableHead className="p-3">Fornecedor</TableHead>
              <TableHead className="p-3">Status</TableHead>
              <TableHead className="p-3">Previsão</TableHead>
              <TableHead className="p-3">Vencimento</TableHead>
              <TableHead className="p-3 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} className="border-b last:border-0 hover:bg-muted/40">
                <TableCell className="p-3">
                  <Link
                    href={"/app/compras/" + order.id}
                    className="font-medium hover:underline"
                  >
                    {order.order_number ??
                      "PC-" + order.id.slice(0, 8).toUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="p-3">{order.suppliers?.name ?? "—"}</TableCell>
                <TableCell className="p-3">
                  {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                </TableCell>
                <TableCell className="p-3">
                  {order.expected_at ? dateOnly(order.expected_at) : "—"}
                </TableCell>
                <TableCell className="p-3">{dateOnly(order.due_date)}</TableCell>
                <TableCell className="p-3 text-right font-medium">
                  {money(order.total_amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!orders.length && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum pedido de compra ainda. Crie o primeiro para conectar compras ao estoque.
          </div>
        )}
      </div>
    </div>
  );
}