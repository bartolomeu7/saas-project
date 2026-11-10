import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { NoAccess } from "@/components/app/no-access";
import { Badge } from "@/components/ui/badge";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { listPayments } from "@/lib/hr/queries";
import { PAYMENT_KIND_LABELS, paymentTitle, PAYMENT_STATUS_LABELS } from "@/lib/hr/labels";
import { dueState } from "@/lib/hr/schedule";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { HrPaymentStatus } from "@/types/hr";

export const metadata: Metadata = { title: "Pagamentos do RH" };

const FILTERS: [HrPaymentStatus | "all", string][] = [
  ["pending", "A pagar"],
  ["paid", "Pagos"],
  ["canceled", "Cancelados"],
  ["all", "Todos"],
];

export default async function HrPaymentsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ situacao?: string }> }) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.view")) return <NoAccess area="o RH" />;

  const status = FILTERS.some(([key]) => key === searchParams?.situacao) ? (searchParams.situacao as HrPaymentStatus | "all") : "pending";
  const payments = await listPayments(current.company.id, { status });
  const today = todayDateSaoPaulo();
  const total = payments.reduce((sum, payment) => sum + payment.net_amount, 0);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div><Link href="/app/rh" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para o RH</Link></div>
      <PageHeader title="Pagamentos" description="Períodos fechados dos funcionários. Pague aqui para lançar a despesa no Financeiro e no Caixa." />

      <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filtrar pagamentos">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "pending" ? "/app/rh/pagamentos" : `/app/rh/pagamentos?situacao=${key}`}
            aria-current={status === key ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5", status === key ? "bg-primary/10 font-medium text-primary-text" : "text-muted-foreground hover:bg-accent")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {payments.length === 0 ? (
        <EmptyState
          title={status === "pending" ? "Nenhum pagamento a fazer." : "Nenhum pagamento encontrado."}
          description="Para gerar um pagamento, abra um funcionário e feche o período dele."
          actionLabel="Ver funcionários"
          actionHref="/app/rh"
          icon={HandCoins}
        />
      ) : (
        <section className="rounded-lg border">
          <ul className="divide-y">
            {payments.map((payment) => {
              const state = payment.status === "pending" ? dueState(payment.due_on, today) : null;
              return (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/app/rh/pagamentos/${payment.id}`} className="font-medium underline-offset-4 hover:underline">
                      {payment.employee?.full_name ?? "Funcionário"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {paymentTitle(payment)} ·{" "}
                      {payment.status === "paid" && payment.paid_on ? `pago em ${formatDate(payment.paid_on)}` : `vence em ${formatDate(payment.due_on)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {state === "overdue" ? <Badge variant="danger">Atrasado</Badge> : state === "today" ? <Badge variant="warning">Hoje</Badge> : null}
                    <Badge variant="muted">{PAYMENT_KIND_LABELS[payment.kind]}</Badge>
                    <Badge variant={payment.status === "paid" ? "success" : payment.status === "pending" ? "warning" : "muted"}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
                    <span className="font-semibold">{formatCurrency(payment.net_amount)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="border-t px-4 py-3 text-right text-sm text-muted-foreground">Total listado: <strong className="text-foreground">{formatCurrency(total)}</strong></p>
        </section>
      )}
    </div>
  );
}
