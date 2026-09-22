import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import {
  getProfessionalWorkspace,
  listCompanyTeam,
  listProfessionalServices,
} from "@/lib/team/queries";
import {
  DeleteBlockForm,
  ProfessionalAvailabilityForm,
  ProfessionalBlockForm,
  ProfessionalForm,
  ProfessionalServicesForm,
} from "@/components/app/team-action-forms";

export const metadata: Metadata = { title: "Configurar profissional" };

export default async function ProfessionalPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const team = await listCompanyTeam();
  const member = team.find((row) => row.professional_id === params.id);

  if (!member) notFound();

  const { professional, services, availability, blocks } = await getProfessionalWorkspace(
    current.company.id,
    params.id
  );
  const catalogServices = await listProfessionalServices(current.company.id);
  const canManage = current.role === "owner" || current.role === "admin";

  if (!professional) notFound();

  return (
    <div className="prime-module-page prime-module-page--equipe flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/app/equipe" className="text-sm text-muted-foreground hover:underline">← Voltar para Equipe</Link>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-primary">Profissional</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{professional.display_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {professional.specialty ?? "Sem especialidade definida"} • {member.email ?? "sem e-mail"}
          </p>
        </div>
        <Link href={"/app/agenda?professional=" + professional.id} className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
          Ver agenda deste profissional
        </Link>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Você tem acesso de visualização. Configurações ficam para owner/admin.
        </div>
      ) : null}

      {canManage ? (
        <>
          <ProfessionalForm member={member} />

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Serviços atendidos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Um profissional só pode ser agendado para os serviços habilitados aqui.
              </p>
              <div className="mt-5">
                <ProfessionalServicesForm
                  professionalId={professional.id}
                  services={catalogServices as { id: string; name: string; duration_minutes: number; sale_price: number }[]}
                  selected={services}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Disponibilidade semanal</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A agenda bloqueia novos horários fora dos dias/horas configurados quando existir uma regra para o dia.
              </p>
              <div className="mt-5">
                <ProfessionalAvailabilityForm professionalId={professional.id} availability={availability} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Bloqueios</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use para almoço, folga, compromisso ou qualquer período sem atendimento.
            </p>
            <div className="mt-5">
              <ProfessionalBlockForm professionalId={professional.id} />
            </div>

            <div className="mt-6 grid gap-3">
              {blocks.map((block) => (
                <div key={block.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(block.starts_at))}
                      {" → "}
                      {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(block.ends_at))}
                    </p>
                    <p className="text-sm text-muted-foreground">{block.reason ?? "Bloqueio sem motivo informado"}</p>
                  </div>
                  <DeleteBlockForm blockId={block.id} />
                </div>
              ))}
              {!blocks.length ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum bloqueio cadastrado.
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Serviços</h2>
            <div className="mt-4 grid gap-2">
              {services.map((service) => (
                <div key={service.id} className="rounded-lg border px-3 py-2 text-sm">{service.service_name}</div>
              ))}
              {!services.length ? <p className="text-sm text-muted-foreground">Nenhum serviço vinculado.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Disponibilidade</h2>
            <p className="mt-3 text-sm text-muted-foreground">{availability.length ? `${availability.length} faixa(s) configurada(s).` : "Nenhuma disponibilidade configurada."}</p>
          </div>
        </section>
      )}
    </div>
  );
}
