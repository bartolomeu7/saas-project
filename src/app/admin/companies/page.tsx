import Link from "next/link";
import { Building2 } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { AdminSubscriptionCell } from "@/components/admin/admin-subscription-cell";
import { CompanyStatusBadge } from "@/components/admin/admin-badges";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_PAGE_SIZE,
  listPlatformCompanies,
  listPlatformPlans,
  requirePlatformAdmin,
} from "@/lib/admin/queries";
import { parseEnum, parsePage, parseSearch, type SearchParams } from "@/lib/admin/params";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  COMPANY_STATUS_LABELS,
  SUBSCRIPTION_FILTER_LABELS,
  type SubscriptionFilterState,
} from "@/types/admin";
import { BUSINESS_TYPE_LABELS, type CompanyStatus } from "@/types/company";

export const metadata = { title: "Empresas" };

const STATUSES = ["active", "inactive"] as const satisfies readonly CompanyStatus[];
const SUBSCRIPTIONS = ["active", "trialing", "expired", "cancelled", "pending", "none"] as const satisfies readonly SubscriptionFilterState[];
const SORTS = [
  { value: "created_desc", label: "Mais recentes" },
  { value: "created_asc", label: "Mais antigas" },
  { value: "name_asc", label: "Nome (A–Z)" },
  { value: "expires_asc", label: "Vencimento mais próximo" },
  { value: "revenue_desc", label: "Maior receita" },
] as const;

/**
 * Lista de empresas da plataforma. Reaproveita a RPC list_platform_admin_companies()
 * (busca, status, plano, assinatura, ordenação e paginação no banco). Cada linha
 * leva à página da empresa, onde ficam edição, status e operações de cobrança.
 */
export default async function AdminCompaniesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const plans = await listPlatformPlans();
  const search = parseSearch(searchParams.q);
  const status = parseEnum(searchParams.status, STATUSES);
  const plan = parseEnum(
    searchParams.plan,
    plans.map((item) => item.code)
  );
  const subscription = parseEnum(searchParams.subscription, SUBSCRIPTIONS);
  const sort = parseEnum(
    searchParams.sort,
    SORTS.map((option) => option.value)
  );
  const page = parsePage(searchParams.page);

  const { rows, total } = await listPlatformCompanies({ search, status, plan, subscription, sort, page });

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title="Empresas"
        description="Empresas cadastradas na plataforma, com dono, equipe e assinatura."
      />

      <AdminFilters
        basePath="/admin/companies"
        search={search}
        searchPlaceholder="Buscar por empresa ou dono"
        selects={[
          {
            name: "status",
            label: "Status",
            allLabel: "Todos os status",
            value: status,
            options: STATUSES.map((value) => ({ value, label: COMPANY_STATUS_LABELS[value] })),
          },
          {
            name: "plan",
            label: "Plano",
            allLabel: "Todos os planos",
            value: plan,
            options: plans.map((item) => ({ value: item.code, label: item.name })),
          },
          {
            name: "subscription",
            label: "Assinatura",
            allLabel: "Qualquer assinatura",
            value: subscription,
            options: SUBSCRIPTIONS.map((value) => ({ value, label: SUBSCRIPTION_FILTER_LABELS[value] })),
          },
          {
            name: "sort",
            label: "Ordenação",
            allLabel: "Ordenar: mais recentes",
            value: sort,
            options: SORTS.map((option) => ({ value: option.value, label: option.label })),
          },
        ]}
      />

      {rows.length === 0 ? (
        page > 1 ? (
          <EmptyState
            icon={Building2}
            title="Esta página não existe"
            description="Há menos páginas de resultados do que a solicitada."
            actionLabel="Ir para a primeira página"
            actionHref="/admin/companies"
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="Nenhuma empresa encontrada"
            description={
              search || status || plan || subscription
                ? "Nenhuma empresa corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Ainda não há empresas cadastradas."
            }
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dono</TableHead>
                <TableHead className="text-right">Membros</TableHead>
                <TableHead>Plano / assinatura</TableHead>
                <TableHead className="text-right">Receita paga</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((company) => (
                <TableRow key={company.company_id}>
                  <TableCell>
                    <div className="flex min-w-[12rem] flex-col">
                      <Link
                        href={`/admin/companies/${company.company_id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {company.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {BUSINESS_TYPE_LABELS[company.business_type]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <CompanyStatusBadge status={company.status} />
                  </TableCell>
                  <TableCell>
                    {company.owner_email || company.owner_name ? (
                      <div className="flex min-w-[10rem] flex-col">
                        <span className="text-foreground">{company.owner_name ?? "Sem nome"}</span>
                        <span className="text-xs text-muted-foreground">
                          {company.owner_email ?? "Sem e-mail"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sem dono</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{company.members_count}</TableCell>
                  <TableCell>
                    <AdminSubscriptionCell
                      planName={company.plan_name}
                      status={company.subscription_status}
                      expiresAt={company.subscription_expires_at}
                      accessActive={company.access_active}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatCurrency(company.paid_total)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(company.created_at)}
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
        basePath="/admin/companies"
        searchParams={{ q: search, status, plan, subscription, sort }}
        itemLabel="empresa"
        itemLabelPlural="empresas"
      />
    </div>
  );
}
