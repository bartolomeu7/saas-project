import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getPurchaseOrderById, listPurchaseReceipts } from "@/lib/purchases/queries";
import {
  cancelPurchaseOrderAction,
  cancelPurchaseReceiptAction,
  receivePurchaseOrderAction,
} from "@/lib/purchases/actions";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/types/purchase";
import { PurchaseReceiveForm } from "@/components/app/purchase-receive-form";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Pedido de compra" };

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateOnly = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informado";

export default async function PurchaseOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const [order, receipts] = await Promise.all([
    getPurchaseOrderById(current.company.id, params.id),
    listPurchaseReceipts(current.company.id, params.id),
  ]);

  if (!order) {
    return <div className="px-4 py-10 text-center">Pedido de compra não encontrado.</div>;
  }

  const remaining = order.purchase_order_items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity - item.received_quantity),
    0
  );

  return (
    <div className="prime-module-page prime-module-page--compras flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/app/compras" className="text-sm text-muted-foreground hover:underline">
            ← Compras
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {order.order_number ?? "PC-" + order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fornecedor: {order.suppliers?.name ?? "—"} ·{" "}
            {PURCHASE_ORDER_STATUS_LABELS[order.status]}
          </p>
        </div>

        {order.status === "ordered" && (
          <form
            action={async (formData) => {
              "use server";
              await cancelPurchaseOrderAction(order.id, formData);
            }}
          >
            <input type="hidden" name="reason" value="Cancelamento manual" />
            <button className={cn(buttonVariants({ variant: "outline" }), "text-destructive")}>
              Cancelar pedido
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total" value={money(order.total_amount)} />
        <MetricCard label="Saldo a receber" value={remaining} />
        <MetricCard label="Vencimento" value={dateOnly(order.due_date)} />
        <MetricCard label="Previsão" value={order.expected_at ? dateOnly(order.expected_at) : "Não informado"} />
      </div>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Itens do pedido</h2>
        </div>
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow className="border-b text-left text-muted-foreground">
              <TableHead className="p-3">Produto</TableHead>
              <TableHead className="p-3">Qtd.</TableHead>
              <TableHead className="p-3">Recebido</TableHead>
              <TableHead className="p-3">Custo</TableHead>
              <TableHead className="p-3 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.purchase_order_items.map((item) => (
              <TableRow key={item.id} className="border-b last:border-0 hover:bg-muted/40">
                <TableCell className="p-3">
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Estoque atual: {item.products?.stock_quantity ?? "—"}
                  </p>
                </TableCell>
                <TableCell className="p-3">{item.quantity}</TableCell>
                <TableCell className="p-3">
                  {item.received_quantity} / {item.quantity}
                </TableCell>
                <TableCell className="p-3">{money(item.unit_cost)}</TableCell>
                <TableCell className="p-3 text-right font-medium">{money(item.total_amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {order.status !== "received" && order.status !== "cancelled" && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Receber mercadoria</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            O recebimento atualiza o estoque de forma atômica e gera a conta a pagar correspondente.
          </p>
          <PurchaseReceiveForm
            action={receivePurchaseOrderAction.bind(null, order.id)}
            order={order}
          />
        </section>
      )}

      {receipts.length > 0 && (
        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Histórico de recebimentos</h2>
          </div>
          <div className="divide-y">
            {receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {receipt.status === "posted"
                      ? "Recebimento lançado"
                      : "Recebimento cancelado"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(receipt.received_at).toLocaleString("pt-BR")} ·{" "}
                    {money(receipt.total_amount)}
                  </p>
                </div>

                {receipt.status === "posted" && (
                  <form
                    action={async (formData) => {
                      "use server";
                      await cancelPurchaseReceiptAction(receipt.id, order.id, formData);
                    }}
                  >
                    <input type="hidden" name="reason" value="Correção de recebimento" />
                    <button
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "text-destructive"
                      )}
                    >
                      Estornar recebimento
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}