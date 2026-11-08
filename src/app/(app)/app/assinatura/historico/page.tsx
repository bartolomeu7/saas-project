import type { Metadata } from "next";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getSubscriptionPayments } from "@/lib/billing/queries";
import { SubscriptionPaymentStatusBadge } from "@/components/app/subscription-payment-status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Histórico de pagamentos",
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function BillingHistoryPage() {
  const current = (await getCurrentCompany())!;
  const payments = await getSubscriptionPayments(current.company.id);

  return (
    <div className="prime-module-page prime-module-page--assinatura flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader title="Histórico de pagamentos" description="Todas as cobranças Pix da assinatura do Prime Ges." />

      {payments.length === 0 ? (
        <EmptyState
          title="Nenhum pagamento ainda."
          description="Assim que você assinar um plano, as cobranças aparecerão aqui."
          actionLabel="Ver planos"
          actionHref="/app/assinatura/planos"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card/40 shadow-soft">
          <Table className="w-full text-left text-sm">
            <TableHeader className="border-b border-border bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <TableRow>
                <TableHead className="px-4 py-3 font-medium">Plano</TableHead>
                <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Data</TableHead>
                <TableHead className="px-4 py-3 font-medium" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id} className="border-b border-border last:border-0">
                  <TableCell className="px-4 py-3 font-medium text-foreground">
                    {payment.plan_name}
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                      {formatDate(payment.created_at)}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-foreground">
                    {CURRENCY_FORMATTER.format(Number(payment.amount))}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <SubscriptionPaymentStatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {formatDate(payment.created_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {payment.status === "pending" && (
                      <Link
                        href={`/app/assinatura/pagamento/${payment.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Ver Pix
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
