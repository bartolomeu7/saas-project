import type { Metadata } from "next";
import { AgendaPrintActions } from "@/components/app/agenda-print-actions";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listAgendaProfessionals, listAppointments } from "@/lib/agenda/queries";
import { timeLabel } from "@/lib/agenda/week-view";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { APPOINTMENT_STATUS_LABELS } from "@/types/appointment";

export const metadata: Metadata = { title: "Imprimir agenda do dia" };

function dateTitle(dateValue: string) {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  const text = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Folha do dia para imprimir (ou salvar em PDF pelo navegador). A folha cobre a tela e, ao imprimir, é a ÚNICA coisa
 * visível (menu e cabeçalho do sistema somem), então funciona em qualquer navegador.
 */
export default async function AgendaPrintPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ date?: string | string[]; professional?: string | string[] }>;
}) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  const rawDate = Array.isArray(searchParams?.date) ? searchParams.date[0] : searchParams?.date;
  const rawProfessional = Array.isArray(searchParams?.professional) ? searchParams.professional[0] : searchParams?.professional;
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateSaoPaulo();

  const [appointments, professionals] = await Promise.all([
    listAppointments(current.company.id, date, rawProfessional),
    listAgendaProfessionals(current.company.id),
  ]);
  const professional = rawProfessional ? professionals.find((row) => row.id === rawProfessional) : undefined;

  const active = appointments.filter((row) => row.status !== "cancelled" && row.status !== "no_show");
  const expected = active.reduce((sum, row) => sum + Number(row.price ?? 0), 0);
  const completed = appointments.filter((row) => row.status === "completed").length;
  const backParams = new URLSearchParams({ date, visao: "dia" });
  if (rawProfessional) backParams.set("professional", rawProfessional);

  return (
    <div className="print-sheet fixed inset-0 z-[100] overflow-auto bg-white p-6 text-black">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-sheet, .print-sheet * { visibility: visible !important; }
          .print-sheet { position: absolute !important; inset: 0 !important; overflow: visible !important; padding: 0 !important; }
          .no-print { display: none !important; }
          @page { margin: 12mm; }
        }
      `}</style>

      <AgendaPrintActions backHref={`/app/agenda?${backParams.toString()}`} />

      <header className="mb-4 border-b border-zinc-300 pb-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{current.company.name} · Agenda do dia</p>
        <h1 className="text-xl font-semibold">{dateTitle(date)}</h1>
        <p className="text-sm text-zinc-600">{professional ? professional.display_name : "Todos os profissionais"}</p>
      </header>

      {appointments.length ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-400 text-left text-xs uppercase text-zinc-600">
              <th className="py-1.5 pr-3">Horário</th>
              <th className="py-1.5 pr-3">Serviço</th>
              <th className="py-1.5 pr-3">Cliente</th>
              <th className="py-1.5 pr-3">Profissional</th>
              <th className="py-1.5 pr-3">Situação</th>
              <th className="py-1.5 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((row) => (
              <tr key={row.id} className="border-b border-zinc-200 align-top break-inside-avoid">
                <td className="whitespace-nowrap py-1.5 pr-3 font-medium">
                  {timeLabel(row.starts_at)}–{timeLabel(row.ends_at)}
                </td>
                <td className="py-1.5 pr-3">
                  {row.service_name ?? "Serviço"}
                  {row.notes ? <span className="block text-xs text-zinc-500">{row.notes}</span> : null}
                </td>
                <td className="py-1.5 pr-3">
                  {row.customer_name ?? "Sem cliente"}
                  {row.customer_phone ? <span className="block text-xs text-zinc-500">{row.customer_phone}</span> : null}
                </td>
                <td className="py-1.5 pr-3">{row.professional_name ?? "—"}</td>
                <td className="py-1.5 pr-3">{APPOINTMENT_STATUS_LABELS[row.status]}</td>
                <td className="whitespace-nowrap py-1.5 text-right">{money(Number(row.price ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="py-10 text-center text-zinc-500">Nenhum atendimento neste dia.</p>
      )}

      <footer className="mt-4 flex flex-wrap justify-between gap-2 border-t border-zinc-300 pt-3 text-sm">
        <span>
          {active.length} atendimento{active.length === 1 ? "" : "s"} · {completed} concluído{completed === 1 ? "" : "s"}
        </span>
        <span>Valor previsto (sem cancelados e faltas): <strong>{money(expected)}</strong></span>
      </footer>
    </div>
  );
}
