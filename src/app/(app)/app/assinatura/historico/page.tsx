import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getSubscriptionPayments } from "@/lib/billing/queries";
import { SubscriptionPaymentStatusBadge } from "@/components/app/subscription-payment-status-badge";
import { EmptyState } from "@/components/app/empty-state";
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
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico de pagamentos</h1>
        <p className="text-sm text-muted-foreground">
          Todas as cobranças Pix da assinatura do Prime Ges.
        </p>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          title="Nenhum pagamento ainda."
          description="Assim que você assinar um plano, as cobranças aparecerão aqui."
          actionLabel="Ver planos"
          actionHref="/app/assinatura/planos"
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          <Table className="w-full text-left text-sm">
            <TableHeader className="border-b border-border bg-secondary/50 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="px-4 py-3 font-medium">Plano</TableHead>
                <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                <TableHead className="px-4 py-3 font-medium">Data</TableHead>
                <TableHead className="px-4 py-3 font-medium" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id} className="border-b border-border last:border-0">
                  <TableCell className="px-4 py-3 font-medium text-foreground">{payment.plan_name}</TableCell>
                  <TableCell className="px-4 py-3 text-foreground">
                    {CURRENCY_FORMATTER.format(Number(payment.amount))}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <SubscriptionPaymentStatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {new Date(payment.created_at).toLocaleDateString("pt-BR")}
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
