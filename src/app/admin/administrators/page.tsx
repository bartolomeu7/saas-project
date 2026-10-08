import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { UserRoleBadge, UserStatusBadge } from "@/components/admin/admin-badges";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPlatformAdministrators, requireSuperAdmin } from "@/lib/admin/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Administradores" };

/**
 * Administradores da plataforma — SUPER_ADMIN ONLY. Três camadas: o middleware
 * barra a rota, requireSuperAdmin() confere is_super_admin() no servidor e a
 * RPC list_platform_administrators() recusa quem não for super_admin ativo.
 * Nesta etapa é só a fundação (listagem); promover, rebaixar e suspender
 * continuam em Usuários, pelas RPCs com auditoria.
 */
export default async function AdminAdministratorsPage() {
  const current = await requireSuperAdmin();
  const administrators = await listPlatformAdministrators();

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Administradores"
        description="Quem tem acesso administrativo à plataforma. Visível apenas para super administradores."
        actions={
          <Link
            href="/admin/users?role=admin"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Gerenciar em Usuários
          </Link>
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
                <TableHead>Último acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {administrators.map((admin) => (
                <TableRow key={admin.user_id}>
                  <TableCell>
                    <div className="flex min-w-[12rem] flex-col">
                      <span className="font-medium text-foreground">
                        {admin.full_name ?? "Sem nome"}
                        {admin.user_id === current.userId && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
                        )}
                      </span>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
