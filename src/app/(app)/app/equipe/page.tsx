import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listCompanyTeam } from "@/lib/team/queries";
import {
  AddMemberForm,
  MemberRoleForm,
  RemoveMemberForm,
} from "@/components/app/team-action-forms";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const current = (await getCurrentCompany())!;
  const team = await listCompanyTeam();
  const canManage = current.role === "owner" || current.role === "admin";

  const admins = team.filter((member) => member.role === "admin" || member.role === "owner").length;
  const professionals = team.filter((member) => member.professional_active).length;

  return (
    <div className="prime-module-page prime-module-page--equipe flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Empresa</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Equipe e profissionais</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Permissões de acesso, ficha profissional, especialidade e disponibilidade para a agenda.
          </p>
        </div>
        <Link href="/app/agenda" className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
          Abrir agenda
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Colaboradores" value={team.length} />
        <MetricCard label="Administradores" value={admins} />
        <MetricCard label="Profissionais ativos" value={professionals} />
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Você tem acesso de visualização. Alterações de equipe e ficha profissional ficam para owner/admin.
        </div>
      ) : null}

      {canManage ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Adicionar colaborador existente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A pessoa precisa ter uma conta Prime Ges antes de ser vinculada à empresa.
          </p>
          <div className="mt-5">
            <AddMemberForm />
          </div>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Colaboradores</h2>
          <p className="text-sm text-muted-foreground">Acesso ao sistema e configuração profissional.</p>
        </div>

        <Table className="w-full min-w-[980px] text-sm">
          <TableHeader>
            <TableRow className="border-b text-left text-muted-foreground">
              <TableHead className="p-3">Pessoa</TableHead>
              <TableHead className="p-3">Função</TableHead>
              <TableHead className="p-3">Profissional</TableHead>
              <TableHead className="p-3">Especialidade</TableHead>
              <TableHead className="p-3">Agenda</TableHead>
              <TableHead className="p-3">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((member) => (
              <TableRow key={member.member_id} className="border-b align-top last:border-0 hover:bg-muted/30">
                <TableCell className="p-3">
                  <div className="font-medium">{member.full_name ?? member.email ?? "Colaborador"}</div>
                  <div className="text-xs text-muted-foreground">{member.email ?? "—"}</div>
                </TableCell>
                <TableCell className="p-3">
                  {canManage ? (
                    <MemberRoleForm member={member} />
                  ) : (
                    <span className="rounded-full border px-2 py-1 text-xs">{member.role}</span>
                  )}
                </TableCell>
                <TableCell className="p-3">
                  {member.professional_id ? (
                    <Link href={"/app/equipe/" + member.professional_id} className="font-medium text-primary hover:underline">
                      {member.display_name ?? member.full_name ?? "Ficha profissional"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Sem ficha</span>
                  )}
                </TableCell>
                <TableCell className="p-3">{member.specialty ?? "—"}</TableCell>
                <TableCell className="p-3">
                  {member.professional_active ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs">Ativo</span>
                  ) : (
                    <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">Inativo</span>
                  )}
                </TableCell>
                <TableCell className="p-3">
                  {canManage ? <RemoveMemberForm memberId={member.member_id} /> : <span className="text-xs text-muted-foreground">Somente leitura</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!team.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado.
          </div>
        ) : null}
      </section>
    </div>
  );
}
