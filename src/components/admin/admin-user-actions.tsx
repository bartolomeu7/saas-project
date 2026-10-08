"use client";

import { toast } from "sonner";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { setUserRoleAction, setUserStatusAction } from "@/lib/admin/actions";
import { canChangeUserRole, canChangeUserStatus } from "@/lib/admin/permissions";
import { USER_ROLE_LABELS } from "@/types/admin";
import type { ActionResult } from "@/lib/auth/actions";
import type { UserRole, UserStatus } from "@/types/profile";

const ROLES: UserRole[] = ["user", "admin", "super_admin"];

function notify(result: ActionResult) {
  if (result.error) {
    toast.error("Não foi possível concluir", { description: result.error });
  } else if (result.success) {
    toast.success(result.success);
  }
}

/**
 * Ações de administração sobre um usuário da lista, conforme a hierarquia:
 *   - suspender/reativar: super_admin em qualquer outro usuário; admin só em
 *     usuários comuns;
 *   - alterar papel: só super_admin; nunca em si mesmo.
 *
 * ISSO É APENAS UX. As Server Actions chamam RPCs SECURITY DEFINER que
 * revalidam ator, alvo e hierarquia no banco e auditam; um pedido forjado para
 * fora deste menu é rejeitado lá do mesmo jeito.
 */
export function AdminUserActions({
  userId,
  userName,
  targetRole,
  targetStatus,
  actorRole,
  isSelf,
}: {
  userId: string;
  userName: string;
  targetRole: UserRole;
  targetStatus: UserStatus;
  actorRole: UserRole;
  isSelf: boolean;
}) {
  const showStatus = canChangeUserStatus(actorRole, targetRole, isSelf);
  const showRole = canChangeUserRole(actorRole, isSelf);

  if (!showStatus && !showRole) {
    return <span className="text-xs text-muted-foreground">{isSelf ? "Você" : "—"}</span>;
  }

  const suspend = targetStatus === "active";

  return (
    <div className="flex min-w-[9rem] flex-col items-start gap-1.5">
      {showStatus && (
        <ConfirmActionForm
          action={async () => notify(await setUserStatusAction(userId, suspend ? "suspended" : "active"))}
          label={suspend ? "Suspender" : "Reativar"}
          title={suspend ? `Suspender ${userName}?` : `Reativar ${userName}?`}
          description={
            suspend
              ? "O usuário será marcado como suspenso. A ação fica registrada na auditoria."
              : "O usuário voltará ao status ativo. A ação fica registrada na auditoria."
          }
          confirmLabel={suspend ? "Suspender" : "Reativar"}
          destructive={suspend}
        />
      )}
      {showRole &&
        ROLES.filter((role) => role !== targetRole).map((role) => (
          <ConfirmActionForm
            key={role}
            action={async () => notify(await setUserRoleAction(userId, role))}
            label={`Tornar ${USER_ROLE_LABELS[role].toLowerCase()}`}
            title={`Alterar o papel de ${userName} para ${USER_ROLE_LABELS[role]}?`}
            description={
              role === "super_admin"
                ? "Super admin tem autoridade máxima sobre a plataforma. A ação fica registrada na auditoria."
                : "A ação fica registrada na auditoria."
            }
            confirmLabel="Alterar papel"
            destructive={role === "super_admin"}
            triggerClassName="text-xs text-muted-foreground"
          />
        ))}
    </div>
  );
}
