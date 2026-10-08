import Link from "next/link";
import { CheckCircle2, Clock, ReceiptText, Wallet } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { PaymentProviderBadge, PaymentStatusBadge } from "@/components/admin/admin-badges";
import { BreakdownBars } from "@/components/admin/admin-charts";
import { EmptyState } from "@/components/app/empty-state";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  endOfDayExclusiveIso,
  parseDateParam,
  parseEnum,
  parsePage,
  parseSearch,
  startOfDayIso,
  type SearchParams,
} from "@/lib/admin/params";
import {
  ADMIN_PAGE_SIZE,
  getPaymentsSummary,
  listPlatformPayments,
  listPlatformPlans,
  requirePlatformAdmin,
} from "@/lib/admin/queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_PROVIDER_LABELS, PAYMENT_STATUS_LABELS } from "@/types/admin";

export const metadata = { title: "Pagamentos" };

const STATUSES = ["pending", "paid", "expired", "cancelled", "failed", "refunded"] as const;
const PROVIDERS = ["evopay", "manual"] as const;
const METHODS = ["pix", "transfer", "cash", "card_external", "other"] as const;
const SORTS = [
  { value: "created_desc", label: "Mais recentes" },
  { value: "created_asc", label: "Mais antigos" },
  { value: "amount_desc", label: "Maior valor" },
] as const;

/**
 * Pagamentos de assinatura da plataforma (EvoPay + manuais). O resumo respeita o
 * mesmo período filtrado. Valores em BRL. Somente leitura aqui: reverificar,
 * anular (manual) e registrar pagamento ficam no detalhe/na empresa, via RPCs
 * com auditoria. Documento do pagador nunca é exibido por inteiro.
 */
export default async function AdminPaymentsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const plans = await listPlatformPlans();
  const search = parseSearch(searchParams.q);
  const status = parseEnum(searchParams.status, STATUSES);
  const provider = parseEnum(searchParams.provider, PROVIDERS);
  const method = parseEnum(searchParams.method, METHODS);
  const plan = parseEnum(
    searchParams.plan,
    plans.map((item) => item.code)
  );
  const sort = parseEnum(
    searchParams.sort,
    SORTS.map((option) => option.value)
  );
  const fromDate = parseDateParam(searchParams.from);
  const toDate = parseDateParam(searchParams.to);
  const from = fromDate ? startOfDayIso(fromDate) : undefined;
  const to = toDate ? endOfDayExclusiveIso(toDate) : undefined;
  const page = parsePage(searchParams.page);

  const [{ rows, total }, summary] = await Promise.all([
    listPlatformPayments({ search, status, provider, method, plan, from, to, sort, page }),
    getPaymentsSummary(from, to),
  ]);
  const hasFilters = Boolean(search || status || provider || method || plan || fromDate || toDate);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Pagamentos"
        description="Pagamentos de assinatura recebidos pela EvoPay e registrados manualmente."
      />

      <section aria-label="Resumo do período" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Recebido"
          value={formatCurrency(summary.paid_total)}
          icon={Wallet}
          detail={`${summary.paid_count} pagamento(s) confirmado(s)`}
        />
        <MetricCard
          label="Pendente"
          value={formatCurrency(summary.pending_total)}
          icon={Clock}
          detail={`${summary.pending_count} aguardando pagamento`}
        />
        <MetricCard
          label="Sem sucesso"
          value={summary.failed_count}
          icon={ReceiptText}
          detail="Expirados, cancelados ou com falha"
        />
        <MetricCard
          label="Estornado"
          value={formatCurrency(summary.refunded_total)}
          icon={CheckCircle2}
          detail="Valor devolvido"
        />
      </section>

      {summary.paid_count > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recebido por origem</CardTitle>
              <CardDescription>Pagamentos confirmados no período.</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownBars
                items={summary.by_provider.map((item) => ({
                  label: PAYMENT_PROVIDER_LABELS[item.provider] ?? item.provider,
                  value: item.total,
                  detail: `${formatCurrency(item.total)} · ${item.count}`,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recebido por forma</CardTitle>
              <CardDescription>EvoPay é sempre Pix.</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownBars
                items={summary.by_method.map((item) => ({
                  label: PAYMENT_METHOD_LABELS[item.method] ?? item.method,
                  value: item.total,
                  detail: `${formatCurrency(item.total)} · ${item.count}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <AdminFilters
        basePath="/admin/payments"
        search={search}
        searchPlaceholder="Buscar por empresa ou referência"
        selects={[
          {
            name: "status",
            label: "Status",
            allLabel: "Todos os status",
            value: status,
            options: STATUSES.map((value) => ({ value, label: PAYMENT_STATUS_LABELS[value] ?? value })),
          },
          {
            name: "provider",
            label: "Origem",
            allLabel: "Qualquer origem",
            value: provider,
            options: PROVIDERS.map((value) => ({ value, label: PAYMENT_PROVIDER_LABELS[value] ?? value })),
          },
          {
            name: "method",
            label: "Forma",
            allLabel: "Qualquer forma",
            value: method,
            options: METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] ?? value })),
          },
          {
            name: "plan",
            label: "Plano",
            allLabel: "Todos os planos",
            value: plan,
            options: plans.map((item) => ({ value: item.code, label: item.name })),
          },
          {
            name: "sort",
            label: "Ordenação",
            allLabel: "Ordenar: mais recentes",
            value: sort,
            options: SORTS.map((option) => ({ value: option.value, label: option.label })),
          },
        ]}
        dates={[
          { name: "from", label: "De", value: fromDate },
          { name: "to", label: "Até", value: toDate },
        ]}
      />

      {rows.length === 0 ? (
        page > 1 ? (
          <EmptyState
            icon={ReceiptText}
            title="Esta página não existe"
            description="Há menos páginas de resultados do que a solicitada."
            actionLabel="Ir para a primeira página"
            actionHref="/admin/payments"
          />
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="Nenhum pagamento encontrado"
            description={
              hasFilters
                ? "Nenhum pagamento corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Ainda não há pagamentos registrados."
            }
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Referência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((payment) => (
                <TableRow key={payment.payment_id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/admin/payments/${payment.payment_id}`}
                      className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {formatDate(payment.paid_at ?? payment.created_at)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/companies/${payment.company_id}`} className="underline-offset-4 hover:underline">
                      {payment.company_name}
                    </Link>
                  </TableCell>
                  <TableCell>{payment.plan_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PaymentProviderBadge provider={payment.provider} />
                      {payment.method && (
                        <span className="text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(payment.amount)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-muted-foreground" title={payment.external_reference ?? undefined}>
                    {payment.external_reference ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
        basePath="/admin/payments"
        searchParams={{ q: search, status, provider, method, plan, sort, from: fromDate, to: toDate }}
        itemLabel="pagamento"
        itemLabelPlural="pagamentos"
      />
    </div>
  );
}
