import Link from "next/link";
import { ReportStat, ReportTable } from "@/components/app/report-table";
import { getQuotesReport } from "@/lib/reports/people-queries";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ReportRange } from "@/types/report";

const percent = (value: number | null) => (value === null ? "—" : value.toLocaleString("pt-BR") + "%");

/** Aba Orçamentos: situação, aprovação e o que virou venda. Só leitura. */
export async function ReportQuotes({ companyId, range }: { companyId: string; range: ReportRange }) {
  const report = await getQuotesReport(companyId, range);

  return (
    <>
      <p className="text-xs text-muted-foreground">Orçamentos emitidos de {formatDate(range.fromDate)} a {formatDate(range.toDate)}, com a situação de hoje.</p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat label="Emitidos" value={report.issued} detail={formatCurrency(report.issuedAmount)} />
        <ReportStat label="Aprovação" value={percent(report.approvalRate)} detail={`${report.approved} de ${report.decided} com resposta ou vencidos`} />
        <ReportStat label="Viraram venda" value={percent(report.conversionRate)} detail={`${report.converted} de ${report.approved} aprovados`} />
        <ReportStat label="Vendido" value={formatCurrency(report.sold)} detail="vendas concluídas vindas desses orçamentos" />
      </section>

      <ReportTable
        title="Por situação"
        columns={[{ label: "Situação" }, { label: "Quantidade", numeric: true }, { label: "Valor", numeric: true }]}
        rows={
          report.issued
            ? report.rows.map((row) => ({
                key: row.status,
                cells: [
                  // a tela de Orçamentos não filtra os convertidos
                  row.status === "converted" ? row.label : <Link key="l" href={`/app/orcamentos?status=${row.status}`} className="font-medium hover:underline">{row.label}</Link>,
                  row.count,
                  formatCurrency(row.amount),
                ],
              }))
            : []
        }
        empty="Nenhum orçamento emitido neste período."
        footer="Aprovação conta aprovados e convertidos sobre os que já têm resposta ou venceram sem ela; rascunhos e enviados no prazo ficam de fora. A lista aberta pela situação mostra todos os períodos."
      />
    </>
  );
}
