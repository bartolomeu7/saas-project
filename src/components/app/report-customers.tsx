import Link from "next/link";
import { ReportStat, ReportTable } from "@/components/app/report-table";
import { getCustomersReport } from "@/lib/reports/people-queries";
import { INACTIVE_OPTIONS } from "@/lib/reports/people";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ReportRange } from "@/types/report";

const customerLink = (id: string, name: string) => <Link href={`/app/clientes/${id}`} className="font-medium hover:underline">{name}</Link>;

/** Aba Clientes: quem comprou no período e quem parou de comprar. Só leitura. */
export async function ReportCustomers({ companyId, range, inactiveDays }: { companyId: string; range: ReportRange; inactiveDays: number }) {
  const report = await getCustomersReport(companyId, range, inactiveDays);
  const periodParams = range.period === "custom" ? `period=custom&from=${range.fromDate}&to=${range.toDate}&` : range.period === "month" ? "" : `period=${range.period}&`;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat label="Compraram no período" value={report.buyers} detail={`${report.registered} cliente(s) cadastrado(s) no período`} />
        <ReportStat label="Novos" value={report.new.customers} detail={`primeira compra · ${formatCurrency(report.new.revenue)}`} />
        <ReportStat label="Recorrentes" value={report.returning.customers} detail={`já tinham comprado · ${formatCurrency(report.returning.revenue)}`} />
        <ReportStat
          label="Vendas sem cliente"
          value={report.anonymous.sales}
          detail={`${report.anonymousShare === null ? "—" : report.anonymousShare.toLocaleString("pt-BR") + "% das vendas"} · ${formatCurrency(report.anonymous.revenue)}`}
        />
      </section>

      <ReportTable
        title="Quem mais comprou no período"
        description="Os 10 maiores em faturamento."
        columns={[{ label: "Cliente" }, { label: "Compras", numeric: true }, { label: "Faturamento", numeric: true }]}
        rows={report.top.map((row) => ({
          key: row.id,
          cells: [<>{customerLink(row.id, row.name)}{row.isNew ? <span className="ml-2 text-xs text-primary">novo</span> : null}</>, row.sales, formatCurrency(row.revenue)],
        }))}
        empty="Nenhuma venda com cliente neste período."
        footer={<Link href={`/app/clientes/ranking?period=custom&from=${range.fromDate}&to=${range.toDate}`} className="font-medium text-primary hover:underline">Ver o ranking completo</Link>}
      />

      <ReportTable
        title="Sem comprar"
        description={
          <>
            <p>Posição de hoje: clientes ativos que já compraram e não voltaram. Não muda com o período escolhido.</p>
            <nav aria-label="Tempo sem comprar" className="mt-3 flex flex-wrap gap-2">
              {INACTIVE_OPTIONS.map((days) => (
                <Link
                  key={days}
                  href={`/app/relatorios?${periodParams}aba=clientes&sumidos=${days}`}
                  aria-current={inactiveDays === days ? "true" : undefined}
                  className={"rounded-full border px-3 py-1.5 text-xs " + (inactiveDays === days ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {days} dias ou mais ({report.inactiveCounts[days]})
                </Link>
              ))}
            </nav>
          </>
        }
        columns={[{ label: "Cliente" }, { label: "Última compra", numeric: true }, { label: "Dias", numeric: true }, { label: "Total gasto", numeric: true }]}
        rows={report.inactive.map((row) => ({ key: row.id, cells: [customerLink(row.id, row.name), formatDate(row.last), row.days, formatCurrency(row.spent)] }))}
        empty={`Ninguém está há ${inactiveDays} dias ou mais sem comprar.`}
        footer={
          <>
            {report.inactiveTotal > report.inactive.length ? <span>Mostrando os {report.inactive.length} que mais gastaram, de {report.inactiveTotal}. </span> : null}
            <span>{report.neverBought} cliente(s) ativo(s) nunca compraram.</span>
          </>
        }
      />
    </>
  );
}
