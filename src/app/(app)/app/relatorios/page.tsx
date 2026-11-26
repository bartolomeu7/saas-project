import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, BarChart3, CalendarDays, CircleDollarSign, FileText, Package, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { NoAccess } from "@/components/app/no-access";
import { getReportsWorkspace } from "@/lib/reports/queries";
import type { ReportPeriod } from "@/types/report";
import { describeChange, entriesDetailHref, formatDay, parseReportPeriod, resolveReportRange, salesDetailHref } from "@/lib/reports/period";
import { formatQuantity } from "@/lib/products/stock-labels";
import { groupByMonth } from "@/lib/reports/summary";
import { BarChart, BreakdownBars } from "@/components/admin/admin-charts";
import { ReportSales } from "@/components/app/report-sales";
import { ReportCustomers } from "@/components/app/report-customers";
import { ReportAgenda } from "@/components/app/report-agenda";
import { ReportQuotes } from "@/components/app/report-quotes";
import { parseInactiveDays, parseReportTab, REPORT_TABS } from "@/lib/reports/people";
import { parseSalesFilters, salesQuery } from "@/lib/reports/sales";

export const metadata: Metadata = { title: "Relatórios" };

function money(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Variação em relação ao período anterior, com o valor de antes. */
function Change({ current, previous }: { current: number; previous: number | null | undefined }) {
  if (previous === null || previous === undefined) return <small className="mt-2 block text-xs text-muted-foreground">Sem base no período anterior</small>;
  const { direction, percent } = describeChange(current, previous);
  if (direction === "same") return <small className="mt-2 block text-xs text-muted-foreground">Igual ao período anterior</small>;
  const up = direction === "up";
  return (
    <small className={"mt-2 block text-xs font-medium " + (up ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
      <span aria-hidden="true">{up ? "▲" : "▼"} </span>
      <span className="sr-only">{up ? "Subiu. " : "Caiu. "}</span>
      {percent === null ? "" : percent.toLocaleString("pt-BR") + "% · "}antes {money(previous)}
    </small>
  );
}

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
  { value: "custom", label: "Personalizado" },
];

export default async function ReportsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<"period" | "from" | "to" | "aba" | "item" | "cliente" | "quem" | "sumidos", string | string[] | undefined>>;
}) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "reports.view")) return <NoAccess area="os Relatórios" />;
  const period = parseReportPeriod(first(searchParams?.period));
  const from = first(searchParams?.from);
  const to = first(searchParams?.to);
  const tab = parseReportTab(first(searchParams?.aba));
  const inactiveDays = parseInactiveDays(first(searchParams?.sumidos));
  const filters = parseSalesFilters({ item: first(searchParams?.item), cliente: first(searchParams?.cliente), quem: first(searchParams?.quem) });
  const range = resolveReportRange(period, from, to);
  const customQuery = period === "custom" ? `&from=${range.fromDate}&to=${range.toDate}` : "";
  // a aba e os filtros acompanham a troca de período e a exportação
  const tabQuery =
    tab === "vendas" ? salesQuery(filters) : tab === "geral" ? "" : tab === "clientes" ? `aba=clientes&sumidos=${inactiveDays}` : `aba=${tab}`;
  const periodHref = (value: ReportPeriod, extra: string) => {
    const query = [value === "month" ? "" : "period=" + value, extra].filter(Boolean).join("&");
    return query ? "/app/relatorios?" + query : "/app/relatorios";
  };
  const header = (
    <>
      <PageHeader
        eyebrow="Análises"
        title="Relatórios"
        description="Leitura operacional baseada nos dados reais da empresa."
        className="sm:flex-col sm:items-start xl:flex-row xl:items-end"
        actions={
          <nav aria-label="Período do relatório" className="flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <Link
                key={item.value}
                href={periodHref(item.value, tabQuery)}
                aria-current={period === item.value ? "true" : undefined}
                className={"rounded-full border px-3 py-1.5 text-xs " + (period === item.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {item.label}
              </Link>
            ))}
            {tab === "geral" || tab === "vendas" ? (
              <a href={"/app/relatorios/export?period=" + period + customQuery + (tabQuery ? "&" + tabQuery : "")} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Exportar CSV
              </a>
            ) : null}
          </nav>
        }
      />

      <nav aria-label="Visões do relatório" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {REPORT_TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={periodHref(period, [key === "geral" ? "" : "aba=" + key, period === "custom" ? `from=${range.fromDate}&to=${range.toDate}` : ""].filter(Boolean).join("&"))}
            aria-current={tab === key ? "page" : undefined}
            className={"rounded-md px-3 py-1.5 text-sm font-medium " + (tab === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3 empty:hidden">
        {period === "custom" ? (
          <form key={range.fromDate + range.toDate} method="get" action="/app/relatorios" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="period" value="custom" />
            {Array.from(new URLSearchParams(tabQuery)).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <label className="grid gap-1 text-xs text-muted-foreground">
              De
              <input type="date" name="from" required defaultValue={range.fromDate} className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Até
              <input type="date" name="to" required defaultValue={range.toDate} className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-secondary">Aplicar</button>
          </form>
        ) : null}
        {range.invalid ? (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            Datas não aceitas: o início precisa vir antes do fim e o intervalo vai até 5 anos. Mostrando o mês atual.
          </p>
        ) : null}
      </div>
    </>
  );

  if (tab !== "geral") {
    const companyId = current.company.id;
    return (
      <div className="prime-module-page flex flex-col gap-6 px-4 py-6 sm:px-6">
        {header}
        {tab === "vendas" ? <ReportSales companyId={companyId} range={range} filters={filters} /> : null}
        {tab === "clientes" ? <ReportCustomers companyId={companyId} range={range} inactiveDays={inactiveDays} /> : null}
        {tab === "agenda" ? <ReportAgenda companyId={companyId} range={range} /> : null}
        {tab === "orcamentos" ? <ReportQuotes companyId={companyId} range={range} /> : null}
      </div>
    );
  }

  const report = await getReportsWorkspace(current.company.id, period, from, to);
  const { previous } = report;
  const salesHref = salesDetailHref(range);
  const byMonth = period === "year" || report.salesTrend.length > 62;
  const trend = byMonth ? groupByMonth(report.salesTrend) : report.salesTrend;
  const hasSales = report.summary.completedSales > 0;
  // até 12 pontos, uma linha por ponto com o valor; acima disso, gráfico compacto. Nenhum dos dois rola de lado
  const compactTrend = trend.length > 12;
  const bestPoint = trend.reduce<(typeof trend)[number] | null>((best, point) => (point.value > (best?.value ?? 0) ? point : best), null);
  const maxItem = Math.max(...report.topItems.map((item) => item.revenue), 1);
  const maxPayment = Math.max(...report.paymentMethods.map((item) => item.amount), 1);

  return (
    <div className="prime-module-page flex flex-col gap-6 px-4 py-6 sm:px-6">
      {header}

      <div className="flex flex-col gap-3">
        {previous ? (
          <p className="text-xs text-muted-foreground">
            {formatDay(range.fromDate)} a {formatDay(range.toDate)}, comparado com {formatDay(previous.fromDate)} a {formatDay(previous.toDate)}.
          </p>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={salesHref} className="prime-kpi-card block">
          <div className="prime-kpi-icon"><CircleDollarSign className="h-4 w-4" /></div>
          <p>Faturamento</p>
          <strong>{money(report.summary.revenue)}</strong>
          <span>{report.summary.completedSales} vendas concluídas · ver vendas →</span>
          <Change current={report.summary.revenue} previous={previous?.revenue} />
        </Link>
        <Link href={salesHref} className="prime-kpi-card block">
          <div className="prime-kpi-icon"><ShoppingCart className="h-4 w-4" /></div>
          <p>Ticket médio</p>
          <strong>{money(report.summary.averageTicket)}</strong>
          <span>somente vendas concluídas · ver vendas →</span>
          {report.summary.averageTicket === null ? null : <Change current={report.summary.averageTicket} previous={previous?.averageTicket} />}
        </Link>
        <a href="#resultado" className="prime-kpi-card block sm:col-span-2 lg:col-span-1">
          <div className="prime-kpi-icon"><CircleDollarSign className="h-4 w-4" /></div>
          <p>Resultado operacional</p>
          <strong>{money(report.summary.netResult)}</strong>
          <span>ver como se chega neste valor ↓</span>
          <Change current={report.summary.netResult} previous={previous?.netResult} />
        </a>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.8fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div><p className="prime-panel-eyebrow">Vendas</p><h2>{byMonth ? "Faturamento por mês" : "Faturamento por dia"}</h2></div>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          {!hasSales ? (
            <div className="mt-5 flex min-h-[220px] w-full items-center justify-center rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Ainda não há vendas concluídas no período selecionado.</div>
          ) : compactTrend ? (
            <>
              <BarChart
                className="mt-5"
                height={180}
                title={byMonth ? "Faturamento por mês no período" : "Faturamento por dia no período"}
                pointLabel={byMonth ? "Mês" : "Dia"}
                valueLabel="Faturamento"
                data={trend.map((point) => ({ label: point.label, value: point.value, detail: money(point.value) }))}
              />
              {bestPoint ? <p className="mt-3 text-xs text-muted-foreground">{byMonth ? "Melhor mês" : "Melhor dia"}: {bestPoint.label}, com {money(bestPoint.value)}.</p> : null}
            </>
          ) : (
            <div className="mt-5">
              <BreakdownBars items={trend.map((point) => ({ label: point.label, value: point.value, detail: money(point.value) }))} />
            </div>
          )}
        </div>

        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Pagamentos</p><h2>Recebimentos por método</h2></div></div>
          <p className="mt-2 text-xs text-muted-foreground">
            {money(report.summary.received)} recebidos no período, pela data do recebimento
            {report.summary.refunds > 0 ? `, já descontados ${money(report.summary.refunds)} de estornos.` : "."}
          </p>
          {previous ? <Change current={report.summary.received} previous={previous.received} /> : null}
          <Link href={entriesDetailHref("recebimentos", range)} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Ver recebimentos</Link>
          <div className="mt-4 space-y-4">
            {report.paymentMethods.length ? report.paymentMethods.map((payment) => (
              <div key={payment.method}>
                <div className="mb-1 flex items-center justify-between text-xs"><span>{payment.label}</span><strong>{money(payment.amount)}</strong></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: (payment.amount > 0 ? Math.max(4, (payment.amount / maxPayment) * 100) : 0) + "%" }} /></div>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum recebimento confirmado no período.</div>
            )}
          </div>
        </div>
      </section>

      <section id="resultado" className="prime-dashboard-panel scroll-mt-24">
        <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Resultado</p><h2>Como se chega no resultado</h2></div></div>
        <dl className="mt-4 divide-y divide-border text-sm">
          {([
            ["Faturamento", report.summary.revenue, salesHref, "ver vendas"],
            ["− Custo das vendas", report.summary.costOfGoods, null, null],
            ["+ Outras receitas", report.summary.otherIncome, entriesDetailHref("outras-receitas", range), "ver lançamentos"],
            ["− Despesas operacionais", report.summary.operatingExpenses, entriesDetailHref("despesas", range), "ver lançamentos"],
          ] as const).map(([label, value, href, action]) => (
            <div key={label} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="flex items-center gap-3">
                {href ? <Link href={href} className="text-xs font-medium text-primary hover:underline" aria-label={`${action} de ${label.replace(/^[−+] /, "")}`}>{action}</Link> : null}
                <strong>{money(value)}</strong>
              </dd>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <dt className="font-medium">= Resultado operacional</dt>
            <dd><strong className="text-base">{money(report.summary.netResult)}</strong></dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Desempenho</p><h2>Itens que mais faturaram</h2></div></div>
          <div className="mt-4 space-y-3">
            {report.topItems.length ? report.topItems.map((item) => (
              <div key={item.itemType + ":" + item.description} className="prime-health-row">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.description}</span><small>{item.itemType === "service" ? "Serviço" : "Produto"} · {formatQuantity(item.quantity)} vendidos</small></span>
                <strong>{money(item.revenue)}</strong>
                <div className="hidden w-28 sm:block"><div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: Math.max(5, (item.revenue / maxItem) * 100) + "%" }} /></div></div>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Não há itens para este relatório.</div>
            )}
          </div>
        </div>

        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Agenda</p><h2>Atendimentos no período</h2></div><CalendarDays className="h-4 w-4 text-muted-foreground" /></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="prime-mini-stat"><span>Total</span><strong>{report.appointments.total}</strong></div>
            <div className="prime-mini-stat"><span>Concluídos</span><strong>{report.appointments.completed}</strong></div>
            <div className="prime-mini-stat"><span>Confirmados</span><strong>{report.appointments.confirmed}</strong></div>
            <div className="prime-mini-stat"><span>Cancelados</span><strong>{report.appointments.cancelled}</strong></div>
            <div className="prime-mini-stat"><span>No-show</span><strong>{report.appointments.noShow}</strong></div>
            <div className="prime-mini-stat"><span>Agendados</span><strong>{report.appointments.scheduled}</strong></div>
          </div>
          <Link href="/app/agenda" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">Abrir agenda <CalendarDays className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Posição de hoje</p><h2>Em aberto e estoque</h2></div><Package className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-2 text-xs text-muted-foreground">Situação atual da empresa: não muda com o período escolhido.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link href="/app/financeiro?view=receber" className="prime-mini-stat hover:bg-muted/40"><span>A receber</span><strong>{money(report.summary.accountsReceivable)}</strong><small>{report.summary.overdueReceivables} venda(s) de dias anteriores</small></Link>
            <Link href="/app/financeiro?view=pagar" className="prime-mini-stat hover:bg-muted/40"><span>A pagar</span><strong>{money(report.summary.accountsPayable)}</strong><small>{report.summary.overduePayables} vencida(s)</small></Link>
            <Link href="/app/estoque" className="prime-mini-stat hover:bg-muted/40"><span>Estoque crítico</span><strong>{report.inventory.lowStock + report.inventory.outOfStock}</strong><small>{report.inventory.outOfStock} sem estoque · {report.inventory.lowStock} baixo</small></Link>
          </div>
        </div>
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Escopo</p><h2>{report.range.label}</h2></div><FileText className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-3 text-sm text-muted-foreground">No período: vendas concluídas, recebimentos pela data em que entraram, despesas operacionais e agenda, comparados com o período anterior. Contas em aberto e estoque mostram a posição de hoje.</p>
          <p className="mt-3 text-xs text-muted-foreground">Fonte: dados transacionais reais do Prime Ges. Nenhuma métrica fictícia é criada para preencher o painel.</p>
        </div>
      </section>
    </div>
  );
}