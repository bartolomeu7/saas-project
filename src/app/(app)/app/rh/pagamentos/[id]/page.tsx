import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/app/no-access";
import { PrintReceiptButton } from "@/components/app/hr-print-button";
import { CancelPaymentButton, PayPaymentForm } from "@/components/app/hr-forms";
import { Badge } from "@/components/ui/badge";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { getEmployee, getPayment } from "@/lib/hr/queries";
import { formatPeriod, PAY_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/hr/labels";
import { dueState, formatDays } from "@/lib/hr/schedule";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";

export const metadata: Metadata = { title: "Pagamento" };

export default async function HrPaymentPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const { id } = await paramsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.view")) return <NoAccess area="o RH" />;
  const payment = await getPayment(current.company.id, id);
  if (!payment) notFound();
  const employee = await getEmployee(current.company.id, payment.employee_id);
  const today = todayDateSaoPaulo();
  const canManage = can(current.role, "hr.manage");
  const state = payment.status === "pending" ? dueState(payment.due_on, today) : null;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .hr-receipt, .hr-receipt * { visibility: visible !important; }
          .hr-receipt { position: absolute !important; inset: 0 !important; padding: 0 !important; border: 0 !important; background: #fff !important; color: #000 !important; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={employee ? `/app/rh/${employee.id}?aba=pagamentos` : "/app/rh/pagamentos"} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar</Link>
        <PrintReceiptButton />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pagamento de {payment.employee?.full_name ?? "funcionário"}</h1>
        <Badge variant={payment.status === "paid" ? "success" : payment.status === "pending" ? "warning" : "muted"}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
        {state === "overdue" ? <Badge variant="danger">Atrasado</Badge> : null}
      </div>

      {payment.status === "pending" && canManage ? (
        <section className="flex flex-col gap-3" aria-labelledby="pag-acao">
          <h2 id="pag-acao" className="text-sm font-semibold">Registrar o pagamento</h2>
          <PayPaymentForm paymentId={payment.id} today={today} />
          <div className="flex flex-col gap-1">
            <CancelPaymentButton paymentId={payment.id} />
            <p className="text-xs text-muted-foreground">Cancelar libera os dias e lançamentos para fechar o período de novo.</p>
          </div>
        </section>
      ) : null}

      <article className="hr-receipt max-w-2xl rounded-lg border bg-card p-6" aria-labelledby="recibo-titulo">
        <header className="mb-4 border-b pb-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{current.company.name}</p>
          <h2 id="recibo-titulo" className="text-lg font-semibold">Recibo de pagamento</h2>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Funcionário</dt><dd className="font-medium">{payment.employee?.full_name ?? "—"}</dd>
          <dt className="text-muted-foreground">Período</dt><dd>{formatPeriod(payment.period_start, payment.period_end)}</dd>
          <dt className="text-muted-foreground">Dias trabalhados</dt><dd>{formatDays(payment.days_worked)}</dd>
          <dt className="text-muted-foreground">Valor bruto</dt><dd>{formatCurrency(payment.gross_amount)}</dd>
          <dt className="text-muted-foreground">Bônus</dt><dd>{formatCurrency(payment.bonus_amount)}</dd>
          <dt className="text-muted-foreground">Descontos</dt><dd>{formatCurrency(payment.deductions_amount)}</dd>
          <dt className="text-muted-foreground">Vales já pagos</dt><dd>{formatCurrency(payment.advances_amount)}</dd>
          <dt className="border-t pt-2 font-semibold">Líquido</dt><dd className="border-t pt-2 text-lg font-semibold">{formatCurrency(payment.net_amount)}</dd>
          <dt className="text-muted-foreground">Situação</dt>
          <dd>
            {payment.status === "paid" && payment.paid_on
              ? `Pago em ${formatDate(payment.paid_on)}${payment.paid_method ? ` (${PAY_METHOD_LABELS[payment.paid_method]})` : ""}`
              : payment.status === "pending"
                ? `A pagar até ${formatDate(payment.due_on)}`
                : "Cancelado"}
          </dd>
        </dl>
        {payment.notes ? <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{payment.notes}</p> : null}
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs text-muted-foreground">
          <div className="border-t pt-2">Assinatura do funcionário</div>
          <div className="border-t pt-2">Assinatura da empresa</div>
        </div>
        <p className="mt-6 text-[11px] text-muted-foreground">Controle interno de pagamento. Este recibo não substitui holerite nem documentos trabalhistas oficiais.</p>
      </article>
    </div>
  );
}
