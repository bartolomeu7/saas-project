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
import { ADMIN_PAGE_SIZE, listPlatformCompanies, requirePlatformAdmin } from "@/lib/admin/queries";
import { parseEnum, parsePage, parseSearch, type SearchParams } from "@/lib/admin/params";
import { formatDate } from "@/lib/format";
import { COMPANY_STATUS_LABELS } from "@/types/admin";
import { BUSINESS_TYPE_LABELS, type CompanyStatus } from "@/types/company";

export const metadata = { title: "Empresas" };

const STATUSES = ["active", "inactive"] as const satisfies readonly CompanyStatus[];

/**
 * Lista de empresas da plataforma. Reaproveita a RPC list_platform_admin_companies()
 * (evoluída com busca, status e paginação) — sem segunda implementação da regra.
 * As ações de ativar/desativar (set_platform_company_status) entram numa etapa
 * seguinte, com confirmação e auditoria.
 */
export default async function AdminCompaniesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const search = parseSearch(searchParams.q);
  const status = parseEnum(searchParams.status, STATUSES);
  const page = parsePage(searchParams.page);

  const { rows, total } = await listPlatformCompanies({ search, status, page });

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
              search || status
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
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((company) => (
                <TableRow key={company.company_id}>
                  <TableCell>
                    <div className="flex min-w-[12rem] flex-col">
                      <span className="font-medium text-foreground">{company.name}</span>
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
        searchParams={{ q: search, status }}
        itemLabel="empresa"
        itemLabelPlural="empresas"
      />
    </div>
  );
}
