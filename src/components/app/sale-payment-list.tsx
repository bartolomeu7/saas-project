import { SalePaymentStatusBadge } from "@/components/app/sale-payment-status-badge";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import type { SalePayment } from "@/types/sale";
import { formatDate } from "@/lib/format";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SalePaymentList({ payments }: { payments: SalePayment[] }) {
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
          <SalePaymentStatusBadge status={payment.status} />
        </li>
      ))}
    </ul>
  );
}
