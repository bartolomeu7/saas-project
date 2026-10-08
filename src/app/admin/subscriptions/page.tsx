import Link from "next/link";
import { CreditCard } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { PaymentProviderBadge } from "@/components/admin/admin-badges";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { SubscriptionStatusBadge } from "@/components/app/subscription-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseEnum, parsePage, parseSearch, type SearchParams } from "@/lib/admin/params";
import {
  ADMIN_PAGE_SIZE,
  listPlatformPlans,
  listPlatformSubscriptions,
  requirePlatformAdmin,
} from "@/lib/admin/queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { SUBSCRIPTION_FILTER_LABELS, type SubscriptionFilterState } from "@/types/admin";

export const metadata = { title: "Assinaturas" };

const STATES = ["active", "trialing", "expired", "cancelled", "pending"] as const satisfies readonly Exclude<SubscriptionFilterState, "none">[];
const PROVIDERS = ["evopay", "manual"] as const;
const EXPIRING = ["7", "15", "30"] as const;
const SORTS = [
  { value: "expires_asc", label: "Vencimento mais próximo" },
  { value: "expires_desc", label: "Vencimento mais distante" },
  { value: "updated_desc", label: "Atualizadas recentemente" },
  { value: "company_asc", label: "Empresa (A–Z)" },
] as const;

/**
 * Assinaturas das empresas (uma por empresa). Estado exibido = o que o guard do
 * produto aplica (status trialing/active E vencimento futuro); "Expirada" aparece
 * também quando o status guardado ainda diz ativo mas a data passou. Operações de
 * acesso ficam na página da empresa (RPCs com auditoria).
 */
export default async function AdminSubscriptionsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const plans = await listPlatformPlans();
  const search = parseSearch(searchParams.q);
  const state = parseEnum(searchParams.state, STATES);
  const plan = parseEnum(
    searchParams.plan,
    plans.map((item) => item.code)
  );
  const provider = parseEnum(searchParams.provider, PROVIDERS);
  const expiring = parseEnum(searchParams.expiring, EXPIRING);
  const sort = parseEnum(
    searchParams.sort,
    SORTS.map((option) => option.value)
  );
  const page = parsePage(searchParams.page);

  const { rows, total } = await listPlatformSubscriptions({
    search,
    state,
    plan,
    provider,
    expiringDays: expiring ? Number(expiring) : undefined,
    sort,
    page,
  });
  const hasFilters = Boolean(search || state || plan || provider || expiring);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Assinaturas"
        description="Situação do acesso de cada empresa: plano, vencimento e origem."
      />

      <AdminFilters
        basePath="/admin/subscriptions"
        search={search}
        searchPlaceholder="Buscar por empresa"
        selects={[
          {
            name: "state",
            label: "Situação",
            allLabel: "Todas as situações",
            value: state,
            options: STATES.map((value) => ({ value, label: SUBSCRIPTION_FILTER_LABELS[value] })),
          },
          {
            name: "plan",
            label: "Plano",
            allLabel: "Todos os planos",
            value: plan,
            options: plans.map((item) => ({ value: item.code, label: item.name })),
          },
          {
            name: "provider",
            label: "Origem",
            allLabel: "Qualquer origem",
            value: provider,
            options: [
              { value: "evopay", label: "EvoPay" },
              { value: "manual", label: "Manual" },
            ],
          },
          {
            name: "expiring",
            label: "Vencimento",
            allLabel: "Qualquer vencimento",
            value: expiring,
            options: EXPIRING.map((value) => ({ value, label: `Vence em até ${value} dias` })),
          },
          {
            name: "sort",
            label: "Ordenação",
            allLabel: "Ordenar: vencimento mais próximo",
            value: sort,
            options: SORTS.map((option) => ({ value: option.value, label: option.label })),
          },
        ]}
      />

      {rows.length === 0 ? (
        page > 1 ? (
          <EmptyState
            icon={CreditCard}
            title="Esta página não existe"
            description="Há menos páginas de resultados do que a solicitada."
            actionLabel="Ir para a primeira página"
            actionHref="/admin/subscriptions"
          />
        ) : (
          <EmptyState
            icon={CreditCard}
            title="Nenhuma assinatura encontrada"
            description={
              hasFilters
                ? "Nenhuma assinatura corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Ainda não há assinaturas."
            }
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Pago (total)</TableHead>
                <TableHead>Último pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.subscription_id}>
                  <TableCell>
                    <div className="flex min-w-[10rem] flex-col">
                      <Link
                        href={`/admin/companies/${row.company_id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.company_name}
                      </Link>
                      {row.company_status === "inactive" && (
                        <span className="text-xs text-warning">Empresa inativa</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{row.plan_name}</TableCell>
                  <TableCell>
                    {row.state === "expired" && (row.status === "active" || row.status === "trialing") ? (
                      <Badge variant="danger">Acesso expirado</Badge>
                    ) : (
                      <SubscriptionStatusBadge status={row.state === "expired" ? "expired" : row.status} />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{formatDate(row.expires_at)}</span>
                      {(row.state === "active" || row.state === "trialing") && (
                        <span className="text-xs text-muted-foreground">restam {row.days_left} dia(s)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{row.provider ? <PaymentProviderBadge provider={row.provider} /> : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(row.paid_total)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.last_paid_at ? formatDate(row.last_paid_at) : "—"}
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
        basePath="/admin/subscriptions"
        searchParams={{ q: search, state, plan, provider, expiring, sort }}
        itemLabel="assinatura"
        itemLabelPlural="assinaturas"
      />
    </div>
  );
}
