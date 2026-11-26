import { SalePaymentStatusBadge } from "@/components/app/sale-payment-status-badge";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import type { SalePayment } from "@/types/sale";
import { formatDate } from "@/lib/format";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { removeSalePaymentAction } from "@/lib/sales/actions";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** `removableFrom` = id da venda quando os pagamentos podem ser desfeitos (rascunho, por quem pode alterá-la). */
export function SalePaymentList({ payments, removableFrom }: { payments: SalePayment[]; removableFrom?: string }) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {payments.map((payment) => (
        <li
          key={payment.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {SALE_PAYMENT_METHOD_LABELS[payment.method]} — {formatMoney(payment.amount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {payment.paid_at ? formatDate(payment.paid_at) : "—"}
              {payment.notes ? ` · ${payment.notes}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SalePaymentStatusBadge status={payment.status} />
            {removableFrom && payment.status === "paid" && (
              <ConfirmActionForm
                action={removeSalePaymentAction.bind(null, removableFrom, payment.id)}
                label="Remover"
                title={`Remover o pagamento de ${formatMoney(payment.amount)}?`}
                description="Ele fica como estornado e o Financeiro (e o caixa, se o dinheiro entrou nele) recebem o lançamento inverso."
                destructive
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
