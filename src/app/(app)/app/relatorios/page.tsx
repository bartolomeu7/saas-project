import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, BarChart3, CalendarDays, CircleDollarSign, FileText, Package, ShoppingCart } from "lucide-react";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getReportsWorkspace } from "@/lib/reports/queries";
import type { ReportPeriod } from "@/types/report";

export const metadata: Metadata = { title: "Relatórios" };

function money(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function periodFromSearch(value: string | string[] | undefined): ReportPeriod {
  const input = Array.isArray(value) ? value[0] : value;
  return input === "today" || input === "7d" || input === "30d" || input === "month" || input === "year" ? input : "month";
}

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
];

export default async function ReportsPage({ searchParams }: { searchParams?: { period?: string | string[] } }) {
  const current = (await getCurrentCompany())!;
  const period = periodFromSearch(searchParams?.period);
  const report = await getReportsWorkspace(current.company.id, period);
  const maxTrend = Math.max(...report.salesTrend.map((point) => point.value), 1);
  const maxItem = Math.max(...report.topItems.map((item) => item.revenue), 1);
  const maxPayment = Math.max(...report.paymentMethods.map((item) => item.amount), 1);

  return (
    <div className="prime-module-page flex flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Análises</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Leitura operacional baseada nos dados reais da empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((item) => (
            <Link
              key={item.value}
              href={item.value === "month" ? "/app/relatorios" : "/app/relatorios?period=" + item.value}
              className={"rounded-full border px-3 py-1.5 text-xs " + (period === item.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {item.label}
            </Link>
          ))}
          <a href={"/app/relatorios/export?period=" + period} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Exportar CSV
          </a>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="prime-kpi-card">
          <div className="prime-kpi-icon"><CircleDollarSign className="h-4 w-4" /></div>
          <p>Faturamento</p>
          <strong>{money(report.summary.revenue)}</strong>
          <span>{report.summary.completedSales} vendas concluídas</span>
        </article>
        <article className="prime-kpi-card">
          <div className="prime-kpi-icon"><ShoppingCart className="h-4 w-4" /></div>
          <p>Ticket médio</p>
          <strong>{money(report.summary.averageTicket)}</strong>
          <span>somente vendas concluídas</span>
        </article>
        <article className="prime-kpi-card">
          <div className="prime-kpi-icon"><CircleDollarSign className="h-4 w-4" /></div>
          <p>Resultado operacional</p>
          <strong>{money(report.summary.netResult)}</strong>
          <span>receita menos despesas operacionais</span>
        </article>
        <article className="prime-kpi-card" data-alert={report.inventory.lowStock + report.inventory.outOfStock > 0 ? "true" : "false"}>
          <div className="prime-kpi-icon"><Package className="h-4 w-4" /></div>
          <p>Estoque crítico</p>
          <strong>{report.inventory.lowStock + report.inventory.outOfStock}</strong>
          <span>{report.inventory.outOfStock} sem estoque · {report.inventory.lowStock} baixo</span>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.8fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div><p className="prime-panel-eyebrow">Vendas</p><h2>Faturamento por dia</h2></div>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-5 flex min-h-[220px] items-end gap-2 overflow-x-auto pb-2">
            {report.salesTrend.length ? report.salesTrend.map((point) => (
              <div key={point.date} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-medium text-muted-foreground">{money(point.value)}</span>
                <div className="flex h-36 w-full max-w-14 items-end rounded-md bg-muted/60 p-1">
                  <div className="w-full rounded-sm bg-primary" style={{ height: Math.max(8, (point.value / maxTrend) * 100) + "%" }} title={point.label + ": " + money(point.value)} />
                </div>
                <span className="text-[10px] text-muted-foreground">{point.label}</span>
              </div>
            )) : (
              <div className="flex w-full items-center justify-center rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Ainda não há vendas concluídas no período selecionado.</div>
            )}
          </div>
        </div>

        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Pagamentos</p><h2>Recebimentos por método</h2></div></div>
          <div className="mt-4 space-y-4">
            {report.paymentMethods.length ? report.paymentMethods.map((payment) => (
              <div key={payment.method}>
                <div className="mb-1 flex items-center justify-between text-xs"><span>{payment.label}</span><strong>{money(payment.amount)}</strong></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: Math.max(4, (payment.amount / maxPayment) * 100) + "%" }} /></div>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum recebimento confirmado no período.</div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Desempenho</p><h2>Itens que mais faturaram</h2></div></div>
          <div className="mt-4 space-y-3">
            {report.topItems.length ? report.topItems.map((item) => (
              <div key={item.itemType + ":" + item.description} className="prime-health-row">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.description}</span><small>{item.itemType === "service" ? "Serviço" : "Produto"} · {item.quantity} vendidos</small></span>
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

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Financeiro</p><h2>Valores em aberto</h2></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="prime-mini-stat"><span>A receber</span><strong>{money(report.summary.accountsReceivable)}</strong><small>{report.summary.overdueReceivables} vencido(s)</small></div>
            <div className="prime-mini-stat"><span>A pagar</span><strong>{money(report.summary.accountsPayable)}</strong><small>{report.summary.overduePayables} vencido(s)</small></div>
          </div>
          <Link href="/app/financeiro" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">Abrir financeiro</Link>
        </div>
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading"><div><p className="prime-panel-eyebrow">Escopo</p><h2>{report.range.label}</h2></div><FileText className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-3 text-sm text-muted-foreground">Este relatório consolida vendas concluídas, recebimentos confirmados, despesas operacionais, agenda e alertas de estoque. Os valores “a receber” e “a pagar” representam o saldo em aberto atual da empresa.</p>
          <p className="mt-3 text-xs text-muted-foreground">Fonte: dados transacionais reais do Prime Ges. Nenhuma métrica fictícia é criada para preencher o painel.</p>
        </div>
      </section>
    </div>
  );
}