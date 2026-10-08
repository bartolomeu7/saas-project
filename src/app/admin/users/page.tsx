import { Users } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { AdminSubscriptionCell } from "@/components/admin/admin-subscription-cell";
import { UserRoleBadge, UserStatusBadge } from "@/components/admin/admin-badges";
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
import { ADMIN_PAGE_SIZE, listPlatformUsers, requirePlatformAdmin } from "@/lib/admin/queries";
import { parseEnum, parsePage, parseSearch, type SearchParams } from "@/lib/admin/params";
import { formatDate } from "@/lib/format";
import { COMPANY_ROLE_LABELS, USER_ROLE_LABELS, USER_STATUS_LABELS } from "@/types/admin";
import type { UserRole, UserStatus } from "@/types/profile";

export const metadata = { title: "Usuários" };

const STATUSES = ["active", "inactive", "suspended"] as const satisfies readonly UserStatus[];
const ROLES = ["user", "admin", "super_admin"] as const satisfies readonly UserRole[];

/**
 * Lista de usuários da plataforma. Dados via list_platform_admin_users()
 * (SECURITY DEFINER + is_platform_admin()): RLS de profiles continua só
 * permitindo cada usuário ler o próprio perfil. Busca, filtros e página vêm da URL.
 * As ações (suspender/reativar/alterar papel) seguem a hierarquia — admin só age
 * sobre usuários comuns, papel é exclusivo de super_admin — e são revalidadas
 * pelas RPCs no banco; a coluna só evita mostrar o que o ator não pode fazer.
 */
export default async function AdminUsersPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const search = parseSearch(searchParams.q);
  const status = parseEnum(searchParams.status, STATUSES);
  const role = parseEnum(searchParams.role, ROLES);
  const page = parsePage(searchParams.page);

  const { rows, total } = await listPlatformUsers({ search, status, role, page });

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title="Usuários"
        description="Todos os usuários da plataforma, com empresa e situação da assinatura."
      />

      <AdminFilters
        basePath="/admin/users"
        search={search}
        searchPlaceholder="Buscar por nome, e-mail ou empresa"
        selects={[
          {
            name: "status",
            label: "Status",
            allLabel: "Todos os status",
            value: status,
            options: STATUSES.map((value) => ({ value, label: USER_STATUS_LABELS[value] })),
          },
          {
            name: "role",
            label: "Papel",
            allLabel: "Todos os papéis",
            value: role,
            options: ROLES.map((value) => ({ value, label: USER_ROLE_LABELS[value] })),
          },
        ]}
      />

      {rows.length === 0 ? (
        page > 1 ? (
          <EmptyState
            icon={Users}
            title="Esta página não existe"
            description="Há menos páginas de resultados do que a solicitada."
            actionLabel="Ir para a primeira página"
            actionHref="/admin/users"
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum usuário encontrado"
            description={
              search || status || role
                ? "Nenhum usuário corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Ainda não há usuários cadastrados."
            }
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano / assinatura</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell>
                    <div className="flex min-w-[12rem] flex-col">
                      <span className="font-medium text-foreground">
                        {user.full_name ?? "Sem nome"}
                      </span>
                      <span className="text-xs text-muted-foreground">{user.email ?? "Sem e-mail"}</span>
                      {!user.clerk_linked && (
                        <span className="text-xs text-warning">Sem vínculo de login (Clerk)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserRoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={user.status} />
                  </TableCell>
                  <TableCell>
                    {user.company_name ? (
                      <div className="flex min-w-[10rem] flex-col">
                        <span className="text-foreground">{user.company_name}</span>
                        {user.company_role && (
                          <span className="text-xs text-muted-foreground">
                            {COMPANY_ROLE_LABELS[user.company_role]}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sem empresa</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AdminSubscriptionCell
                      planName={user.plan_name}
                      status={user.subscription_status}
                      expiresAt={user.subscription_expires_at}
                      accessActive={user.access_active}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {user.last_login_at ? formatDate(user.last_login_at) : "Não registrado"}
                  </TableCell>
                  <TableCell>
                    <AdminUserActions
                      userId={user.user_id}
                      userName={user.full_name ?? user.email ?? "este usuário"}
                      targetRole={user.role}
                      targetStatus={user.status}
                      actorRole={admin.role}
                      isSelf={user.user_id === admin.userId}
                    />
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
        basePath="/admin/users"
        searchParams={{ q: search, status, role }}
        itemLabel="usuário"
        itemLabelPlural="usuários"
      />
    </div>
  );
}
