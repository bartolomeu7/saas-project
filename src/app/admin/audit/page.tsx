import Link from "next/link";
import { ScrollText } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { AuditCategoryBadge } from "@/components/admin/admin-badges";
import { metadataSummary } from "@/components/admin/admin-detail-parts";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  endOfDayExclusiveIso,
  parseDateParam,
  parseEnum,
  parsePage,
  parseSearch,
  parseUuid,
  startOfDayIso,
  type SearchParams,
} from "@/lib/admin/params";
import { ADMIN_PAGE_SIZE, listPlatformAudit, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS } from "@/types/admin";

export const metadata = { title: "Auditoria" };

/**
 * Central de auditoria. SUPER_ADMIN vê todos os registros; ADMIN vê apenas as
 * próprias ações (a RPC list_platform_audit() aplica a mesma regra da RLS de
 * audit_logs). Cada registro mostra a categoria, o ator, o alvo e um resumo do
 * metadata — que passa por platform_safe_metadata() no banco e nunca contém
 * tokens, senhas ou payloads brutos.
 */
export default async function AdminAuditPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const search = parseSearch(searchParams.q);
  const category = parseEnum(searchParams.category, AUDIT_CATEGORIES);
  const companyId = parseUuid(searchParams.company);
  const fromDate = parseDateParam(searchParams.from);
  const toDate = parseDateParam(searchParams.to);
  const page = parsePage(searchParams.page);

  const { rows, total } = await listPlatformAudit({
    search,
    category,
    companyId,
    from: fromDate ? startOfDayIso(fromDate) : undefined,
    to: toDate ? endOfDayExclusiveIso(toDate) : undefined,
    page,
  });
  const hasFilters = Boolean(search || category || companyId || fromDate || toDate);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Auditoria"
        description={
          admin.role === "super_admin"
            ? "Todas as operações registradas na plataforma."
            : "Suas operações administrativas registradas. Super administradores veem o histórico completo."
        }
      />

      <AdminFilters
        basePath="/admin/audit"
        search={search}
        searchPlaceholder="Buscar por ação, e-mail ou empresa"
        selects={[
          {
            name: "category",
            label: "Categoria",
            allLabel: "Todas as categorias",
            value: category,
            options: AUDIT_CATEGORIES.map((value) => ({ value, label: AUDIT_CATEGORY_LABELS[value] })),
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
            icon={ScrollText}
            title="Esta página não existe"
            description="Há menos páginas de resultados do que a solicitada."
            actionLabel="Ir para a primeira página"
            actionHref="/admin/audit"
          />
        ) : (
          <EmptyState
            icon={ScrollText}
            title="Nenhum registro encontrado"
            description={
              hasFilters
                ? "Nenhum registro corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Ainda não há operações registradas."
            }
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Ator</TableHead>
                <TableHead>Alvo</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(entry.created_at)}</TableCell>
                  <TableCell>
                    <AuditCategoryBadge category={entry.category} />
                  </TableCell>
                  <TableCell>
                    <code className="break-all text-xs">{entry.action}</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.actor_email ?? "sistema"}</TableCell>
                  <TableCell>
                    <div className="flex min-w-[8rem] flex-col text-sm">
                      {entry.company_id && entry.company_name && (
                        <Link href={`/admin/companies/${entry.company_id}`} className="underline-offset-4 hover:underline">
                          {entry.company_name}
                        </Link>
                      )}
                      {entry.target_user_id && (
                        <Link href={`/admin/users/${entry.target_user_id}`} className="text-muted-foreground underline-offset-4 hover:underline">
                          {entry.target_email ?? "usuário"}
                        </Link>
                      )}
                      {!entry.company_id && !entry.target_user_id && <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[22rem]">
                    {Object.keys(entry.metadata).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <details className="text-xs">
                        <summary className="cursor-pointer break-words text-foreground/80">
                          {metadataSummary(entry.metadata) || "Ver detalhes"}
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-2 text-[11px]">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
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
        basePath="/admin/audit"
        searchParams={{ q: search, category, company: companyId, from: fromDate, to: toDate }}
        itemLabel="registro"
        itemLabelPlural="registros"
      />
    </div>
  );
}
