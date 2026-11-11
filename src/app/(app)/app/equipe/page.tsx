import { CalendarCheck, ShieldCheck, Users } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import type { TeamMember } from "@/types/team";
import { getSeatUsage, listCompanyTeam } from "@/lib/team/queries";
import {
  AddMemberForm,
  MemberRoleForm,
  RemoveMemberForm,
} from "@/components/app/team-action-forms";
import { TeamMemberCard } from "@/components/app/team-member-card";
import { can, canManageMember } from "@/lib/permissions/matrix";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const current = (await getCurrentCompany())!;
  const [team, seats] = await Promise.all([listCompanyTeam(), getSeatUsage()]);
  const canManage = current.role === "owner" || current.role === "admin";
  const isOwner = can(current.role, "team.manage_admins");
  const currentUser = await getCurrentUser();
  // Ninguém altera a própria função nem se remove por esta tela (evita o dono se tirar da empresa por engano).
  const canManageThis = (member: TeamMember) =>
    canManageMember(current.role, member.role) && member.user_id !== currentUser?.id;

  const admins = team.filter((member) => member.role === "admin" || member.role === "owner").length;
  const professionals = team.filter((member) => member.professional_active).length;

  return (
    <div className="prime-module-page prime-module-page--equipe flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Empresa"
        title="Equipe e profissionais"
        description="Permissões de acesso, ficha profissional, especialidade e disponibilidade para a agenda."
        className="lg:items-end"
        actions={
          <Link href="/app/agenda" className={cn(buttonVariants({ variant: "outline" }))}>
            Abrir agenda
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Colaboradores" value={team.length} icon={Users} />
        <MetricCard label="Administradores" value={admins} icon={ShieldCheck} />
        <MetricCard label="Profissionais ativos" value={professionals} icon={CalendarCheck} />
      </div>

      {seats ? (
        <div
          role={seats.overLimit ? "alert" : undefined}
          className={
            seats.overLimit
              ? "rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              : seats.atLimit
                ? "rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
                : "rounded-xl border border-border bg-card/40 p-4 text-sm"
          }
        >
          <p className="font-medium">
            Usuários do plano: {seats.totalUsed} de {seats.totalAllowed} (1 proprietário + {seats.additionalUsed} de {seats.additionalMax} adicionais)
          </p>
          {seats.overLimit ? (
            <p className="mt-1 text-muted-foreground">
              A empresa tem mais usuários do que o plano atual permite. Ninguém foi removido, mas novas inclusões ficam bloqueadas até você
              remover colaboradores ou <Link href="/app/assinatura/planos" className="font-medium underline underline-offset-4">trocar de plano</Link>.
            </p>
          ) : seats.atLimit ? (
            <p className="mt-1 text-muted-foreground">
              O limite do plano foi atingido: para adicionar mais pessoas,{" "}
              <Link href="/app/assinatura/planos" className="font-medium underline underline-offset-4">altere o plano</Link>.
            </p>
          ) : null}
        </div>
      ) : null}

      {!canManage ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Você tem acesso de visualização. Alterações de equipe e ficha profissional ficam para owner/admin.
        </div>
      ) : null}

      {canManage ? (
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <h2 className="font-semibold">Adicionar colaborador existente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A pessoa precisa ter uma conta Prime Ges antes de ser vinculada à empresa.
          </p>
          <div className="mt-5">
            {seats?.atLimit || seats?.overLimit ? (
              <p className="text-sm text-muted-foreground">
                Inclusões indisponíveis: o limite de usuários do plano foi atingido.{" "}
                <Link href="/app/assinatura/planos" className="font-medium underline underline-offset-4">Ver planos</Link>.
              </p>
            ) : (
              <AddMemberForm canAddAdmin={isOwner} />
            )}
          </div>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-border bg-card/40">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Colaboradores</h2>
          <p className="text-sm text-muted-foreground">Acesso ao sistema e configuração profissional.</p>
        </div>

        {/* Abaixo de xl: cartões (mesmas informações e ações); a partir de xl: tabela. */}
        {team.length ? (
          <ul className="divide-y xl:hidden">
            {team.map((member) => (
              <TeamMemberCard
                key={member.member_id}
                member={member}
                canManage={canManageThis(member)}
                isOwner={isOwner}
              />
            ))}
          </ul>
        ) : null}

        <div className="hidden xl:block">
        <Table className="w-full min-w-[980px] text-sm">
          <TableHeader className="bg-secondary/60 text-[11px] uppercase tracking-wider">
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
                  {canManageThis(member) ? (
                    <MemberRoleForm member={member} isOwner={isOwner} />
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
                  {canManageThis(member) ? <RemoveMemberForm memberId={member.member_id} /> : <span className="text-xs text-muted-foreground">Somente leitura</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        {!team.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado.
          </div>
        ) : null}
      </section>
    </div>
  );
}
