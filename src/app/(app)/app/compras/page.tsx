import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getPurchaseStats, listPurchaseOrders } from "@/lib/purchases/queries";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/types/purchase";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
          <div key={label} className="prime-kpi-card rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-3">Pedido</th>
              <th className="p-3">Fornecedor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Previsão</th>
              <th className="p-3">Vencimento</th>
              <th className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="p-3">
                  <Link
                    href={"/app/compras/" + order.id}
                    className="font-medium hover:underline"
                  >
                    {order.order_number ??
                      "PC-" + order.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td className="p-3">{order.suppliers?.name ?? "—"}</td>
                <td className="p-3">
                  {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                </td>
                <td className="p-3">
                  {order.expected_at ? dateOnly(order.expected_at) : "—"}
                </td>
                <td className="p-3">{dateOnly(order.due_date)}</td>
                <td className="p-3 text-right font-medium">
                  {money(order.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!orders.length && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum pedido de compra ainda. Crie o primeiro para conectar compras ao estoque.
          </div>
        )}
      </div>
    </div>
  );
}