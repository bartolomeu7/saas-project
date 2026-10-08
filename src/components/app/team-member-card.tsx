import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MemberRoleForm, RemoveMemberForm } from "@/components/app/team-action-forms";
import type { TeamMember } from "@/types/team";

/**
 * Apresentação compacta de um colaborador para telas estreitas (abaixo de `xl`),
 * onde a tabela de 6 colunas de /app/equipe exigiria rolagem lateral longa.
 * Mostra as mesmas informações e ações das colunas da tabela.
 */
export function TeamMemberCard({
  member,
  canManage,
}: {
  member: TeamMember;
  canManage: boolean;
}) {
  return (
    <li className="flex flex-col gap-4 p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{member.full_name ?? member.email ?? "Colaborador"}</p>
        <p className="truncate text-xs text-muted-foreground">{member.email ?? "—"}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Profissional</dt>
          <dd className="mt-0.5 truncate">
            {member.professional_id ? (
              <Link
                href={"/app/equipe/" + member.professional_id}
                className="font-medium text-primary hover:underline"
              >
                {member.display_name ?? member.full_name ?? "Ficha profissional"}
              </Link>
            ) : (
              <span className="text-muted-foreground">Sem ficha</span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Especialidade</dt>
          <dd className="mt-0.5 truncate">{member.specialty ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Agenda</dt>
          <dd className="mt-0.5">
            {member.professional_active ? (
              <Badge variant="success">Ativo</Badge>
            ) : (
              <Badge variant="muted">Inativo</Badge>
            )}
          </dd>
        </div>
        {!canManage && (
          <div>
            <dt className="text-xs text-muted-foreground">Função</dt>
            <dd className="mt-0.5">
              <span className="rounded-full border px-2 py-1 text-xs">{member.role}</span>
            </dd>
          </div>
        )}
      </dl>

      {canManage ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          <MemberRoleForm member={member} />
          <RemoveMemberForm memberId={member.member_id} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Somente leitura</p>
      )}
    </li>
  );
}
