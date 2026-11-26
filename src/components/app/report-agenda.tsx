import Link from "next/link";
import { ReportStat, ReportTable } from "@/components/app/report-table";
import { getAgendaReport } from "@/lib/reports/people-queries";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ReportRange } from "@/types/report";

const percent = (value: number | null) => (value === null ? "—" : value.toLocaleString("pt-BR") + "%");

/** Aba Agenda: atendimentos, faltas e vendas por profissional. Só leitura. */
export async function ReportAgenda({ companyId, range }: { companyId: string; range: ReportRange }) {
  const report = await getAgendaReport(companyId, range);

  return (
    <>
      <p className="text-xs text-muted-foreground">Atendimentos marcados de {formatDate(range.fromDate)} a {formatDate(report.until)}.</p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat label="Atendimentos" value={report.total} detail="todas as situações" />
        <ReportStat label="Concluídos" value={report.completed} detail={`${formatCurrency(report.revenue)} em vendas ligadas`} />
        <ReportStat label="Faltas" value={report.noShow} detail={`${percent(report.noShowRate)} de concluídos e faltas`} />
        <ReportStat label="Sem baixa" value={report.unsettled} detail="o horário passou e ninguém marcou o que houve" />
      </section>

      <ReportTable
        title="Por profissional"
        columns={[
          { label: "Profissional" },
          { label: "Total", numeric: true },
          { label: "Concluídos", numeric: true },
          { label: "Faltas", numeric: true },
          { label: "% faltas", numeric: true },
          { label: "Cancelados", numeric: true },
          { label: "A fazer", numeric: true },
          { label: "Sem baixa", numeric: true },
          { label: "Vendas", numeric: true },
        ]}
        rows={report.professionals.map((row) => ({
          key: row.id ?? "sem",
          cells: [<span key="n" className="font-medium">{row.name}</span>, row.total, row.completed, row.noShow, percent(row.noShowRate), row.cancelled, row.upcoming, row.unsettled, formatCurrency(row.revenue)],
        }))}
        empty="Nenhum atendimento neste período."
        footer={
          <>
            <span>Vendas: só as geradas ao concluir um atendimento; venda feita direto na tela de Vendas não tem profissional. </span>
            <Link href={`/app/agenda?date=${range.toDate}`} className="font-medium text-primary hover:underline">Abrir agenda</Link>
          </>
        }
      />
    </>
  );
}
