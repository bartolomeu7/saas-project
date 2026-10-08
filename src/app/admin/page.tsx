import Link from "next/link";
import { Activity, Building2, Clock, CreditCard, TrendingUp, Users, Wallet, Wifi } from "lucide-react";
import { AuditCategoryBadge } from "@/components/admin/admin-badges";
import { BarChart, BreakdownBars } from "@/components/admin/admin-charts";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformDashboard, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const metadata = { title: "Dashboard" };

function shortDay(isoDay: string): string {
  const [, month, day] = isoDay.split("-");
  return `${day}/${month}`;
}

function deltaLabel(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "sem período anterior para comparar" : "sem movimento nos 60 dias";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(0)}% vs. 30 dias anteriores`;
}

/**
 * Dashboard da plataforma. Todo número vem de get_platform_dashboard() (uma única
 * RPC SECURITY DEFINER, agregando no banco): usuários, presença, empresas,
 * assinaturas, receita (EvoPay + manual), séries de 30 dias, distribuição por plano,
 * saúde do webhook e auditoria recente (admin vê só as próprias ações). A “receita
 * recorrente estimada” é derivada (preço ÷ duração × 30 das assinaturas pagas
 * ativas) e vem rotulada como estimativa. Nada é fictício.
 */
export default async function AdminDashboardPage() {
  const [admin, dashboard] = await Promise.all([requirePlatformAdmin(), getPlatformDashboard()]);
  const { users, presence, companies, subscriptions, revenue, webhooks_24h: webhooks } = dashboard;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Plataforma"
        title="Dashboard"
        description={`Visão geral do Prime Ges. Atualizado em ${formatDateTime(dashboard.generated_at)}.`}
      />

      <section aria-label="Indicadores principais" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Usuários"
          value={users.total}
          icon={Users}
          detail={`${users.active} ativos · ${users.suspended} suspensos · +${users.new_7d} na semana`}
        />
        <MetricCard
          label="Online agora"
          value={presence.online_now}
          icon={Wifi}
          detail={`${presence.recent} ativos nos últimos ${presence.recent_minutes} min · ${presence.seen_24h} em 24 h`}
        />
        <MetricCard
          label="Empresas"
          value={companies.total}
          icon={Building2}
          detail={`${companies.active} ativas · ${companies.inactive} inativas · +${companies.new_30d} em 30 dias`}
        />
        <MetricCard
          label="Assinaturas com acesso"
          value={subscriptions.active + subscriptions.trialing}
          icon={CreditCard}
          detail={`${subscriptions.active} pagas · ${subscriptions.trialing} em teste grátis`}
        />
      </section>

      <section aria-label="Financeiro" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Receita (30 dias)"
          value={formatCurrency(revenue.paid_30d)}
          icon={Wallet}
          detail={`${deltaLabel(revenue.paid_30d, revenue.paid_prev_30d)} · ${revenue.paid_count_30d} pagamento(s)`}
        />
        <MetricCard
          label="Receita total"
          value={formatCurrency(revenue.paid_total)}
          icon={TrendingUp}
          detail={`Manual nos 30 dias: ${formatCurrency(revenue.manual_30d)}`}
        />
        <MetricCard
          label="Recorrente estimada (mensal)"
          value={formatCurrency(dashboard.mrr_estimate)}
          icon={Activity}
          detail="Estimativa: assinaturas pagas ativas, preço ÷ duração × 30"
        />
        <MetricCard
          label="Pagamentos pendentes"
          value={revenue.pending_count}
          icon={Clock}
          detail={`${formatCurrency(revenue.pending_total)} aguardando`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receita por dia</CardTitle>
            <CardDescription>Pagamentos confirmados nos últimos 30 dias.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              title="Receita por dia nos últimos 30 dias"
              valueLabel="Receita"
              data={dashboard.payments_by_day.map((point) => ({
                label: shortDay(point.day),
                value: point.total,
                detail: `${formatCurrency(point.total)} · ${point.count} pagamento(s)`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novos usuários por dia</CardTitle>
            <CardDescription>Cadastros nos últimos 30 dias ({users.new_30d} no total).</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              title="Novos usuários por dia nos últimos 30 dias"
              valueLabel="Novos usuários"
              data={dashboard.signups_by_day.map((point) => ({
                label: shortDay(point.day),
                value: point.users,
                detail: `${point.users} usuário(s) · ${point.companies} empresa(s)`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas por plano</CardTitle>
            <CardDescription>Apenas as que têm acesso liberado agora.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              emptyLabel="Nenhuma assinatura com acesso liberado."
              items={dashboard.subscriptions_by_plan.map((item) => ({
                label: item.plan_name,
                value: item.count,
                detail: String(item.count),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atenção</CardTitle>
            <CardDescription>Itens que pedem ação do time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link
              href="/admin/subscriptions?expiring=7&sort=expires_asc"
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Vencem em até 7 dias</span>
              <Badge variant={subscriptions.expiring_7d > 0 ? "warning" : "muted"}>{subscriptions.expiring_7d}</Badge>
            </Link>
            <Link
              href="/admin/subscriptions?state=expired"
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Assinaturas expiradas</span>
              <Badge variant={subscriptions.expired > 0 ? "danger" : "muted"}>{subscriptions.expired}</Badge>
            </Link>
            <Link
              href="/admin/companies?subscription=none"
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Empresas sem assinatura</span>
              <Badge variant={subscriptions.companies_without_subscription > 0 ? "warning" : "muted"}>
                {subscriptions.companies_without_subscription}
              </Badge>
            </Link>
            <Link
              href="/admin/payments?status=pending"
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Pagamentos pendentes</span>
              <Badge variant={revenue.pending_count > 0 ? "warning" : "muted"}>{revenue.pending_count}</Badge>
            </Link>
            <Link
              href="/admin/integrations"
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Webhooks com erro (24 h)</span>
              <Badge variant={webhooks.error > 0 ? "danger" : "muted"}>{webhooks.error}</Badge>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhooks (24 h)</CardTitle>
            <CardDescription>Entregas recebidas da EvoPay.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              emptyLabel="Nenhuma entrega nas últimas 24 horas."
              items={[
                { label: "Processadas", value: webhooks.processed },
                { label: "Ignoradas", value: webhooks.ignored },
                { label: "Sem pagamento", value: webhooks.payment_not_found },
                { label: "Com erro", value: webhooks.error },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade administrativa recente</CardTitle>
          <CardDescription>
            {admin.role === "super_admin" ? "Últimas operações de toda a plataforma." : "Suas últimas operações."}{" "}
            <Link href="/admin/audit" className="underline-offset-4 hover:underline">
              Ver auditoria completa
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.recent_audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma operação registrada ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {dashboard.recent_audit.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <AuditCategoryBadge category={entry.category} />
                    <code className="text-xs text-muted-foreground">{entry.action}</code>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)} · {entry.actor_email ?? "sistema"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
