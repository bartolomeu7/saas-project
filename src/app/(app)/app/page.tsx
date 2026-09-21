import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Package,
  Plus,
  ShoppingCart,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCustomerStats, getRecentCustomers } from "@/lib/customers/queries";
import { getProductStats } from "@/lib/products/queries";
import { getServiceStats } from "@/lib/services/queries";
import { getSaleStats, resolveSalePeriodRange } from "@/lib/sales/queries";
import { getSaleSegmentHints } from "@/config/sale-segments";
import { QuickActions } from "@/components/app/quick-actions";

export const metadata: Metadata = {
  title: "Dashboard",
};

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function firstName(fullName?: string | null) {
  return fullName?.trim().split(" ")[0] ?? "";
}

function ProgressStep({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="prime-onboarding-step group"
      data-done={done ? "true" : "false"}
    >
      <span className="prime-onboarding-icon" aria-hidden="true">
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {done ? "Concluído" : "Próximo passo"}
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default async function DashboardPage() {
  const [current, profile] = await Promise.all([
    getCurrentCompany(),
    getCurrentProfile(),
  ]);

  const company = current!.company;
  const monthRange = resolveSalePeriodRange("month");
  const [customerStats, productStats, serviceStats, saleStats, recentCustomers] =
    await Promise.all([
      getCustomerStats(company.id),
      getProductStats(company.id),
      getServiceStats(company.id),
      getSaleStats(company.id, monthRange.from, monthRange.to),
      getRecentCustomers(company.id, 5),
    ]);

  const saleHints = getSaleSegmentHints(company.business_type);
  const completedSetup = [
    customerStats.total > 0,
    productStats.total > 0 || serviceStats.total > 0,
    saleStats.completedCount > 0,
  ].filter(Boolean).length;

  const attentionCount =
    productStats.lowStock + productStats.outOfStock + (customerStats.total === 0 ? 1 : 0);

  return (
    <div className="prime-dashboard mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="prime-dashboard-hero">
        <div>
          <span className="prime-dashboard-eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            Visão operacional
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {firstName(profile?.full_name) ? `Olá, ${firstName(profile?.full_name)}.` : "Olá."}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            O que está acontecendo na {company.name} hoje.
          </p>
        </div>
        <div className="prime-dashboard-status">
          <span className="prime-live-dot" aria-hidden="true" />
          Operação online
        </div>
      </section>

      <section aria-labelledby="dashboard-kpis">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="dashboard-kpis" className="prime-dashboard-section-title">
            Hoje e este mês
          </h2>
          <span className="text-[10px] text-muted-foreground">Dados reais da empresa</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="prime-kpi-card">
            <div className="prime-kpi-icon"><ShoppingCart className="h-4 w-4" /></div>
            <p>Vendas no mês</p>
            <strong>{saleStats.totalInPeriod}</strong>
            <span>{saleStats.completedCount} concluídas</span>
          </article>
          <article className="prime-kpi-card">
            <div className="prime-kpi-icon"><CircleDollarSign className="h-4 w-4" /></div>
            <p>Faturamento</p>
            <strong>{money(saleStats.revenue)}</strong>
            <span>vendas concluídas no mês</span>
          </article>
          <article className="prime-kpi-card">
            <div className="prime-kpi-icon"><Users className="h-4 w-4" /></div>
            <p>Clientes</p>
            <strong>{customerStats.total}</strong>
            <span>{customerStats.recent} novos nos últimos 7 dias</span>
          </article>
          <article className="prime-kpi-card" data-alert={attentionCount > 0 ? "true" : "false"}>
            <div className="prime-kpi-icon"><AlertTriangle className="h-4 w-4" /></div>
            <p>Atenção</p>
            <strong>{attentionCount}</strong>
            <span>
              {attentionCount === 0
                ? "Nenhum ponto crítico"
                : "itens para revisar agora"}
            </span>
          </article>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,.9fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div>
              <p className="prime-panel-eyebrow">Atenção</p>
              <h2>O que merece uma ação</h2>
            </div>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {productStats.outOfStock > 0 && (
              <Link href="/app/produtos?stock=out" className="prime-attention-item">
                <span className="prime-attention-icon prime-attention-danger"><Package className="h-4 w-4" /></span>
                <span><strong>{productStats.outOfStock} produto(s) sem estoque</strong><small>Revisar estoque</small></span>
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            )}
            {productStats.lowStock > 0 && (
              <Link href="/app/produtos?stock=low" className="prime-attention-item">
                <span className="prime-attention-icon"><Package className="h-4 w-4" /></span>
                <span><strong>{productStats.lowStock} produto(s) com estoque baixo</strong><small>Ver produtos</small></span>
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            )}
            {customerStats.total === 0 && (
              <Link href="/app/clientes/novo" className="prime-attention-item">
                <span className="prime-attention-icon"><Users className="h-4 w-4" /></span>
                <span><strong>Cadastre o primeiro cliente</strong><small>Começar relacionamento</small></span>
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            )}
            {productStats.outOfStock === 0 && productStats.lowStock === 0 && customerStats.total > 0 && (
              <div className="prime-attention-empty sm:col-span-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span><strong>Nenhum alerta operacional</strong><small>Não encontramos estoque crítico ou ausência de clientes.</small></span>
              </div>
            )}
          </div>
        </div>

        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div>
              <p className="prime-panel-eyebrow">Configuração</p>
              <h2>Primeiros passos</h2>
            </div>
            <span className="prime-progress-value">{completedSetup}/3</span>
          </div>
          <div className="prime-progress-track" aria-label={`${completedSetup} de 3 etapas concluídas`}>
            <span style={{ width: `${(completedSetup / 3) * 100}%` }} />
          </div>
          <div className="mt-3 space-y-1">
            <ProgressStep done={customerStats.total > 0} label="Cadastrar cliente" href="/app/clientes/novo" />
            <ProgressStep done={productStats.total > 0 || serviceStats.total > 0} label="Cadastrar produto ou serviço" href={productStats.total > 0 ? "/app/produtos" : "/app/servicos"} />
            <ProgressStep done={saleStats.completedCount > 0} label={saleHints.newSaleLabel} href="/app/vendas/nova" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div>
              <p className="prime-panel-eyebrow">Operação</p>
              <h2>Desempenho do mês</h2>
            </div>
            <Link href="/app/vendas" className="prime-panel-link">Ver vendas <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="prime-mini-stat"><span>Vendas</span><strong>{saleStats.totalInPeriod}</strong></div>
            <div className="prime-mini-stat"><span>Faturamento</span><strong>{money(saleStats.revenue)}</strong></div>
            <div className="prime-mini-stat"><span>Ticket médio</span><strong>{saleStats.averageTicket === null ? "—" : money(saleStats.averageTicket)}</strong></div>
            <div className="prime-mini-stat"><span>Canceladas</span><strong>{saleStats.cancelledCount}</strong></div>
          </div>
          <div className="prime-no-chart">
            <Activity className="h-4 w-4" />
            <span>O gráfico histórico entra quando houver dados suficientes para uma leitura útil.</span>
          </div>
        </div>

        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div>
              <p className="prime-panel-eyebrow">Catálogo</p>
              <h2>Saúde da operação</h2>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Link href="/app/produtos" className="prime-health-row"><Package className="h-4 w-4" /><span>Produtos</span><strong>{productStats.total}</strong></Link>
            <Link href="/app/servicos" className="prime-health-row"><Wrench className="h-4 w-4" /><span>Serviços</span><strong>{serviceStats.total}</strong></Link>
            <Link href="/app/clientes" className="prime-health-row"><Users className="h-4 w-4" /><span>Clientes ativos</span><strong>{customerStats.active}</strong></Link>
          </div>
        </div>
      </section>

      <section className="prime-dashboard-panel">
        <div className="prime-panel-heading">
          <div>
            <p className="prime-panel-eyebrow">Atalhos</p>
            <h2>Faça mais rápido</h2>
          </div>
        </div>
        <div className="mt-4">
          <QuickActions businessType={company.business_type} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div><p className="prime-panel-eyebrow">Clientes</p><h2>Mais recentes</h2></div>
            <Link href="/app/clientes" className="prime-panel-link">Abrir <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="mt-3 divide-y divide-border">
            {recentCustomers.length > 0 ? recentCustomers.map((customer) => (
              <Link key={customer.id} href={`/app/clientes/${customer.id}`} className="prime-customer-row">
                <span className="prime-customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate">{customer.name}</strong><small>{customer.email || customer.phone || "Cliente cadastrado"}</small></span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            )) : (
              <div className="prime-inline-empty">
                <Users className="h-5 w-5" />
                <span><strong>Nenhum cliente cadastrado</strong><small>Cadastre o primeiro para começar.</small></span>
              </div>
            )}
          </div>
        </div>

        <div className="prime-dashboard-panel">
          <div className="prime-panel-heading">
            <div><p className="prime-panel-eyebrow">Atividade</p><h2>Histórico recente</h2></div>
          </div>
          <div className="prime-inline-empty mt-3">
            <Activity className="h-5 w-5" />
            <span><strong>Ainda sem linha do tempo</strong><small>O sistema já preserva os dados das operações; a timeline unificada será adicionada numa próxima etapa.</small></span>
          </div>
        </div>
      </section>
    </div>
  );
}
