"use client";

import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import {
  addCompanyMemberAction,
  removeCompanyMemberAction,
  setCompanyMemberRoleAction,
  transferCompanyOwnershipAction,
} from "@/lib/admin/actions";
import type { CompanyRole } from "@/types/company";

const REASON_FIELD = {
  type: "textarea",
  name: "reason",
  label: "Motivo",
  required: true,
  maxLength: 500,
  placeholder: "Ex.: pedido do proprietário, correção de cadastro...",
  hint: "Fica registrado na auditoria.",
} as const;

const ASSIGNABLE_ROLES = [
  { value: "employee", label: "Colaborador (employee)" },
  { value: "admin", label: "Administrador da empresa (admin)" },
];

/** Adiciona um perfil EXISTENTE e ATIVO à empresa. O banco impede que alguém pertença a duas empresas e respeita o limite do plano. */
export function AddCompanyMemberButton({ companyId }: { companyId: string }) {
  return (
    <AdminActionDialog
      triggerLabel="Adicionar colaborador"
      title="Adicionar colaborador"
      description="A pessoa precisa já ter conta no Prime Ges (cadastro pelo Clerk) e não pertencer a outra empresa. O limite de usuários do plano é respeitado."
      submitLabel="Adicionar"
      idempotent
      action={(formData) => addCompanyMemberAction(companyId, formData)}
      fields={[
        { type: "email", name: "email", label: "E-mail da conta", required: true, maxLength: 254, placeholder: "pessoa@empresa.com.br" },
        { type: "select", name: "role", label: "Papel na empresa", required: true, defaultValue: "employee", options: ASSIGNABLE_ROLES },
        REASON_FIELD,
      ]}
    />
  );
}

/** Ações por membro. O proprietário não tem ações aqui: a propriedade só muda pela transferência (super administrador). */
export function MemberRowActions({
  companyId,
  userId,
  displayName,
  companyRole,
}: {
  companyId: string;
  userId: string;
  displayName: string;
  companyRole: CompanyRole;
}) {
  if (companyRole === "owner") {
    return <span className="text-xs text-muted-foreground">Proprietário</span>;
  }
  const nextRole = companyRole === "admin" ? "employee" : "admin";

  return (
    <div className="flex flex-wrap gap-1.5">
      <AdminActionDialog
        triggerLabel="Alterar papel"
        triggerSize="sm"
        title={`Alterar o papel de ${displayName}`}
        description="Muda o papel na empresa (não altera o papel na plataforma)."
        submitLabel="Salvar"
        action={(formData) => setCompanyMemberRoleAction(companyId, userId, formData)}
        fields={[
          { type: "select", name: "role", label: "Novo papel", required: true, defaultValue: nextRole, options: ASSIGNABLE_ROLES },
          REASON_FIELD,
        ]}
      />
      <AdminActionDialog
        triggerLabel="Remover"
        triggerVariant="destructive"
        title={`Remover ${displayName} da empresa?`}
        description="A pessoa perde o acesso aos dados desta empresa, mas a conta e o histórico continuam existindo."
        submitLabel="Remover"
        destructive
        action={(formData) => removeCompanyMemberAction(companyId, userId, formData)}
        fields={[REASON_FIELD]}
      />
    </div>
  );
}

/** SUPER_ADMIN: transfere a propriedade a um membro ativo; o proprietário atual vira administrador da empresa. */
export function TransferOwnershipButton({
  companyId,
  candidates,
}: {
  companyId: string;
  candidates: { userId: string; label: string }[];
}) {
  if (candidates.length === 0) return null;
  return (
    <AdminActionDialog
      triggerLabel="Transferir propriedade"
      title="Transferir a propriedade da empresa"
      description="O novo proprietário precisa ser membro com conta ativa. O proprietário atual passa a administrador da empresa. Exclusivo de super administrador."
      submitLabel="Transferir"
      destructive
      idempotent
      action={(formData) => transferCompanyOwnershipAction(companyId, formData)}
      fields={[
        {
          type: "select",
          name: "newOwnerUserId",
          label: "Novo proprietário",
          required: true,
          defaultValue: "",
          options: candidates.map((candidate) => ({ value: candidate.userId, label: candidate.label })),
        },
        REASON_FIELD,
        { type: "checkbox", name: "confirm", label: "Confirmo a transferência de propriedade desta empresa." },
      ]}
    />
  );
}
