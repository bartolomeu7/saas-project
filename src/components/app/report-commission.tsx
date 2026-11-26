import Link from "next/link";
import { CommissionRateForm, ItemProfessionalForm } from "@/components/app/commission-forms";
import { ReportStat, ReportTable } from "@/components/app/report-table";
import { getCommissionReport } from "@/lib/reports/commission-queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";
import type { ReportRange } from "@/types/report";

const percent = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";

/** Aba Comissão: quanto cada profissional tem a receber, percentuais e quem fez cada serviço. */
export async function ReportCommission({ companyId, range }: { companyId: string; range: ReportRange }) {
  const report = await getCommissionReport(companyId, range);
  const monthStart = todayDateSaoPaulo().slice(0, 8) + "01";
  const activeTeam = report.team.filter((member) => member.active);

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Serviços de vendas totalmente recebidas de {formatDate(range.fromDate)} a {formatDate(range.toDate)}, pelo valor já com descontos. Produtos não entram.
      </p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat label="Comissão do período" value={formatCurrency(report.commission)} detail={`sobre ${formatCurrency(report.base)} recebidos em serviços`} />
        <ReportStat label="Prevista a receber" value={formatCurrency(report.pendingCommission)} detail={`${formatCurrency(report.pendingBase)} em vendas concluídas no período e ainda não recebidas`} />
        <ReportStat label="Serviços recebidos" value={report.itemsTotal} detail="itens contados no período" />
        <ReportStat label="Sem profissional" value={report.unassigned.services} detail={`${formatCurrency(report.unassigned.base)} sem comissão: escolha quem fez abaixo`} />
      </section>

      {report.noRates ? (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          Nenhum profissional tem percentual definido: a comissão aparece zerada. Defina abaixo.
        </p>
      ) : null}

      <ReportTable
        title="Por profissional"
        columns={[
          { label: "Profissional" },
          { label: "Serviços", numeric: true },
          { label: "Recebido", numeric: true },
          { label: "Comissão", numeric: true },
          { label: "A receber", numeric: true },
          { label: "Prevista", numeric: true },
        ]}
        rows={report.professionals.map((row) => ({
          key: row.id ?? "sem",
          cells: [<span key="n" className="font-medium">{row.name}</span>, row.services, formatCurrency(row.base), <strong key="c">{formatCurrency(row.commission)}</strong>, formatCurrency(row.pendingBase), formatCurrency(row.pendingCommission)],
        }))}
        empty="Nenhum serviço recebido ou a receber neste período."
      />

      <section className="rounded-xl border border-border bg-card/40 print:hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold">Percentual de cada profissional</h2>
          <p className="text-sm text-muted-foreground">Vale a partir da data escolhida, pela data em que a venda foi recebida. O que foi recebido antes dela não muda.</p>
        </div>
        <ul className="divide-y divide-border">
          {activeTeam.map((member) => (
            <li key={member.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="break-words font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {member.percent === null ? "Sem percentual" : `${percent(member.percent)} desde ${formatDate(member.validFrom!)}`}
                </p>
              </div>
              <CommissionRateForm professionalId={member.id} name={member.name} percent={member.percent} from={monthStart} />
            </li>
          ))}
        </ul>
        {!activeTeam.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum profissional ativo. <Link href="/app/equipe" className="font-medium text-primary hover:underline">Abrir equipe</Link>
          </p>
        ) : null}
      </section>

      <ReportTable
        title="Serviços recebidos"
        description="Quem fez vem do atendimento da agenda. Nas vendas feitas direto, escolha aqui."
        columns={[{ label: "Serviço" }, { label: "Recebido em", numeric: true }, { label: "Valor", numeric: true }, { label: "Profissional" }, { label: "%", numeric: true }, { label: "Comissão", numeric: true }]}
        rows={report.items.map((item) => ({
          key: item.itemId,
          cells: [
            <Link key="s" href={`/app/vendas/${item.saleId}`} className="font-medium hover:underline">{item.description}</Link>,
            formatDate(item.date),
            formatCurrency(item.base),
            <div key="p">
              <div className="print:hidden">
                <ItemProfessionalForm
                  itemId={item.itemId}
                  value={item.chosen ? (item.professionalId ?? "") : ""}
                  emptyLabel={item.chosen ? "Voltar ao da agenda" : item.professional ? `Da agenda: ${item.professional}` : "Escolher..."}
                  team={activeTeam}
                  description={item.description}
                />
              </div>
              <span className="hidden print:inline">{item.professional ?? "Sem profissional"}</span>
            </div>,
            percent(item.percent),
            formatCurrency(item.commission),
          ],
        }))}
        empty="Nenhum serviço recebido neste período."
        footer={report.itemsTotal > report.items.length ? `Mostrando ${report.items.length} de ${report.itemsTotal} (sem profissional primeiro). Os totais acima consideram todos; use um período menor para ver os demais.` : undefined}
      />
    </>
  );
}
