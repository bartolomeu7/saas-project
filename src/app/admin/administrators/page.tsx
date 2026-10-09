import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { UserRoleBadge, UserStatusBadge } from "@/components/admin/admin-badges";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeRoleByEmailAction } from "@/lib/admin/actions";
import { listPlatformAdministrators, requireSuperAdmin } from "@/lib/admin/queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Administradores" };

/**
 * Administradores da plataforma — SUPER_ADMIN ONLY. Três camadas: o middleware
 * barra a rota, requireSuperAdmin() confere is_super_admin() no servidor e as RPCs
 * recusam quem não for super_admin ativo. Promoção é sempre de um perfil EXISTENTE
 * (localizado por e-mail): esta tela nunca cria identidade nem senha — quem ainda
 * não tem conta precisa se cadastrar pelo Clerk antes. O banco impede, inclusive
 * sob concorrência, remover/suspender o ÚLTIMO super_admin ativo e alterar o
 * próprio papel/status.
 */
export default async function AdminAdministratorsPage() {
  const current = await requireSuperAdmin();
  const administrators = await listPlatformAdministrators();
  const activeSupers = administrators.filter((admin) => admin.role === "super_admin" && admin.status === "active").length;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Administradores"
        description={`Quem tem acesso administrativo à plataforma. ${activeSupers} super administrador(es) ativo(s). Visível apenas para super administradores.`}
        actions={
          <AdminActionDialog
            triggerLabel="Promover por e-mail"
            triggerVariant="default"
            title="Promover usuário existente"
            description="Informe o e-mail de quem já tem conta no Prime Ges. Nenhuma conta é criada por aqui. A ação fica registrada na auditoria."
            submitLabel="Alterar papel"
            action={changeRoleByEmailAction}
            fields={[
              { type: "email", name: "email", label: "E-mail do usuário", required: true, maxLength: 254 },
              {
                type: "select",
                name: "role",
                label: "Novo papel",
                required: true,
                defaultValue: "admin",
                options: [
                  { value: "admin", label: "Admin" },
                  { value: "super_admin", label: "Super admin" },
                  { value: "user", label: "Usuário (remover acesso administrativo)" },
                ],
              },
            ]}
          />
        }
      />

      {administrators.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhum administrador encontrado"
          description="Não há perfis com papel administrativo."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Administrador</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Último login</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {administrators.map((admin) => (
                <TableRow key={admin.user_id}>
                  <TableCell>
                    <div className="flex min-w-[12rem] flex-col">
                      <Link
                        href={`/admin/users/${admin.user_id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {admin.full_name ?? "Sem nome"}
                        {admin.user_id === current.userId && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
                        )}
                      </Link>
                      <span className="text-xs text-muted-foreground">{admin.email ?? "Sem e-mail"}</span>
                      {!admin.clerk_linked && (
                        <span className="text-xs text-warning">Sem vínculo de login (Clerk)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserRoleBadge role={admin.role} />
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={admin.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(admin.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {admin.last_login_at ? formatDate(admin.last_login_at) : "Não registrado"}
                  </TableCell>
                  <TableCell>
                    <AdminUserActions
                      userId={admin.user_id}
                      userName={admin.full_name ?? admin.email ?? "este administrador"}
                      targetRole={admin.role}
                      targetStatus={admin.status}
                      actorRole={current.role}
                      isSelf={admin.user_id === current.userId}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
