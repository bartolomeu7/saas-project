import Link from "next/link";
import type { getSupplierPurchases } from "@/lib/purchases/queries";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/types/purchase";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateOnly = (value: string | null) => (value ? value.slice(0, 10).split("-").reverse().join("/") : "sem vencimento");

export function SupplierPurchases({ data }: { data: Awaited<ReturnType<typeof getSupplierPurchases>> }) {
  if (!data) {
    return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Não foi possível carregar as compras deste fornecedor. Atualize a página.</p>;
  }
  return (
    <section aria-labelledby="fornecedor-compras" className="max-w-4xl rounded-xl border border-border bg-card/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h2 id="fornecedor-compras" className="font-semibold">Compras e contas a pagar</h2>
        <p className="text-sm text-muted-foreground">
          {data.totalOrders} {data.totalOrders === 1 ? "pedido" : "pedidos"} · Saldo a pagar: <strong className="text-foreground">{money(data.openBalance)}</strong>
        </p>
      </div>

      {data.openPayables.length > 0 && (
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-medium">Contas em aberto</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.openPayables.map((payable) => (
              <li key={payable.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="min-w-0 break-words">{payable.description} · {dateOnly(payable.due_date)}</span>
                <span className="tabular-nums">{money(Number(payable.amount) - Number(payable.paid_amount ?? 0))}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/financeiro" className="mt-2 inline-block text-sm underline">Pagar no Financeiro</Link>
        </div>
      )}

      {data.orders.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum pedido de compra para este fornecedor.</p>
      ) : (
        <div className="p-4">
          <h3 className="text-sm font-medium">{data.totalOrders > data.orders.length ? "Últimos 10 pedidos" : "Pedidos"}</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.orders.map((order) => (
              <li key={order.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Link href={`/app/compras/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                    {order.order_number ?? "PC-" + order.id.slice(0, 8).toUpperCase()}
                  </Link>{" "}
                  · {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                </span>
                <span className="tabular-nums">{money(Number(order.total_amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
