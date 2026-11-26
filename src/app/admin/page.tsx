import { Activity, Building2, CalendarClock, CircleAlert, Clock, CreditCard, LifeBuoy, ReceiptText, Server, TrendingUp, Users, Wallet, Webhook, Wifi } from "lucide-react";
import { AuditCategoryBadge } from "@/components/admin/admin-badges";
import { BreakdownBars } from "@/components/admin/admin-charts";
import { CountUp, LiveRefresh, OpenSearchButton, PeriodChart } from "@/components/admin/dashboard/dashboard-client";
import { AttentionList, StatCard, rise } from "@/components/admin/dashboard/dashboard-parts";
import { IntentLink } from "@/components/admin/intent-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformDashboard, listPlatformTickets, requirePlatformAdmin } from "@/lib/admin/queries";
import { readServerHealth, timed } from "@/lib/admin/server-health";
import { formatCurrency, formatDateTime, formatRelative } from "@/lib/format";

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
 * assinaturas, receita (gateway + manual), séries de 30 dias, distribuição por plano,
 * saúde do webhook e auditoria recente (admin vê só as próprias ações). A “receita
 * recorrente estimada” é derivada (preço ÷ duração × 30 das assinaturas pagas
 * ativas) e vem rotulada como estimativa. O cartão "Servidor" mede o próprio
 * processo do site e o tempo dessa consulta. Nada é fictício.
 */
export default async function AdminDashboardPage() {
  const [admin, [dashboard, databaseMs], openTickets] = await Promise.all([
    requirePlatformAdmin(),
    timed(getPlatformDashboard),
    listPlatformTickets("open"),
  ]);
  const { users, presence, companies, subscriptions, revenue, webhooks_24h: webhooks } = dashboard;
  const server = readServerHealth();
  const firstName = admin.fullName?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="prime-admin-rise prime-admin-hero" style={rise(0)}>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <span className="prime-admin-live" aria-hidden="true" /> Plataforma ao vivo
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {firstName ? `Olá, ${firstName}` : "Dashboard"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {presence.online_now} pessoa(s) online agora · {presence.seen_24h} nas últimas 24 h. Atualizado em{" "}
            {formatDateTime(dashboard.generated_at)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OpenSearchButton />
          <LiveRefresh />
        </div>
      </section>

      <section aria-label="Indicadores principais" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={1}
          href="/admin/users"
          label="Usuários"
          value={<CountUp value={users.total} />}
          icon={Users}
          detail={`${users.active} ativos · ${users.suspended} suspensos · +${users.new_7d} na semana`}
          trend={dashboard.signups_by_day.map((point) => point.users)}
        />
        <StatCard
          index={2}
          href="/admin/users?presence=online"
          label="Online agora"
          value={<CountUp value={presence.online_now} />}
          icon={Wifi}
          detail={`${presence.recent} ativos nos últimos ${presence.recent_minutes} min · ${presence.seen_24h} em 24 h`}
        />
        <StatCard
          index={3}
          href="/admin/companies"
          label="Empresas"
          value={<CountUp value={companies.total} />}
          icon={Building2}
          detail={`${companies.active} ativas · ${companies.inactive} inativas · +${companies.new_30d} em 30 dias`}
          trend={dashboard.signups_by_day.map((point) => point.companies)}
        />
        <StatCard
          index={4}
          href="/admin/subscriptions"
          label="Assinaturas com acesso"
          value={<CountUp value={subscriptions.active + subscriptions.trialing} />}
          icon={CreditCard}
          detail={`${subscriptions.active} pagas/concedidas (${subscriptions.lifetime} vitalícia(s)) · ${subscriptions.trialing} em teste grátis`}
        />
      </section>

      <section aria-label="Financeiro" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={5}
          href="/admin/payments?status=paid"
          label="Receita (30 dias)"
          value={<CountUp value={revenue.paid_30d} format="currency" />}
          icon={Wallet}
          detail={`${deltaLabel(revenue.paid_30d, revenue.paid_prev_30d)} · ${revenue.paid_count_30d} pagamento(s)`}
          trend={dashboard.payments_by_day.map((point) => point.total)}
        />
        <StatCard
          index={6}
          href="/admin/payments"
          label="Receita total"
          value={<CountUp value={revenue.paid_total} format="currency" />}
          icon={TrendingUp}
          detail={`30 dias: gateway ${formatCurrency(revenue.gateway_30d ?? revenue.evopay_30d)} · manual ${formatCurrency(revenue.manual_30d)} · estornado (total) ${formatCurrency(revenue.refunded_total)}`}
        />
        <StatCard
          index={7}
          href="/admin/subscriptions?state=active"
          label="Recorrente estimada (mensal)"
          value={<CountUp value={dashboard.mrr_estimate} format="currency" />}
          icon={Activity}
          detail="Estimativa: assinaturas pagas ativas com prazo, preço ÷ duração × 30 (vitalícias e testes não entram)"
        />
        <StatCard
          index={8}
          href="/admin/payments?status=pending"
          label="Pagamentos pendentes"
          value={<CountUp value={revenue.pending_count} />}
          icon={Clock}
          detail={`${formatCurrency(revenue.pending_total)} aguardando`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodChart
          title="Receita por dia"
          description="Pagamentos confirmados."
          valueLabel="Receita"
          format="currency"
          data={dashboard.payments_by_day.map((point) => ({
            label: shortDay(point.day),
            value: point.total,
            detail: `${formatCurrency(point.total)} · ${point.count} pagamento(s)`,
          }))}
        />
        <PeriodChart
          title="Novos usuários por dia"
          description="Cadastros."
          valueLabel="Novos usuários"
          data={dashboard.signups_by_day.map((point) => ({
            label: shortDay(point.day),
            value: point.users,
            detail: `${point.users} usuário(s) · ${point.companies} empresa(s)`,
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AttentionList
          items={[
            { label: "Chamados de suporte abertos", href: "/admin/support", count: openTickets.total, tone: "danger", icon: LifeBuoy },
            { label: "Webhooks com erro (24 h)", href: "/admin/integrations", count: webhooks.error, tone: "danger", icon: Webhook },
            { label: "Assinaturas expiradas", href: "/admin/subscriptions?state=expired", count: subscriptions.expired, tone: "danger", icon: CircleAlert },
            { label: "Vencem em até 7 dias", href: "/admin/subscriptions?expiring=7&sort=expires_asc", count: subscriptions.expiring_7d, tone: "warning", icon: CalendarClock },
            { label: "Empresas sem assinatura", href: "/admin/companies?subscription=none", count: subscriptions.companies_without_subscription, tone: "warning", icon: Building2 },
            { label: "Pagamentos pendentes", href: "/admin/payments?status=pending", count: revenue.pending_count, tone: "warning", icon: ReceiptText },
          ]}
        />

        <Card className="prime-admin-card">
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

        <div className="flex flex-col gap-4">
          <Card className="prime-admin-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> Servidor
              </CardTitle>
              <CardDescription>Medido agora, ao abrir esta tela.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Site ligado há</dt>
                  <dd className="mt-1 font-semibold text-foreground">{server.uptime}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Memória do site</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-foreground">{server.memoryMb} MB</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Resposta do banco</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-foreground">{databaseMs} ms</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="prime-admin-card">
            <CardHeader>
              <CardTitle className="text-base">Webhooks (24 h)</CardTitle>
              <CardDescription>Entregas recebidas dos gateways de pagamento.</CardDescription>
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
      </div>

      <Card className="prime-admin-card">
        <CardHeader>
          <CardTitle className="text-base">Atividade administrativa recente</CardTitle>
          <CardDescription>
            {admin.role === "super_admin" ? "Últimas operações de toda a plataforma." : "Suas últimas operações."}{" "}
            <IntentLink href="/admin/audit" className="underline-offset-4 hover:underline">
              Ver auditoria completa
            </IntentLink>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.recent_audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma operação registrada ainda.</p>
          ) : (
            <ol className="prime-admin-timeline">
              {dashboard.recent_audit.map((entry, index) => (
                <li key={entry.id} className="prime-admin-rise flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between" style={rise(index)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <AuditCategoryBadge category={entry.category} />
                    <code className="text-xs text-muted-foreground">{entry.action}</code>
                  </div>
                  <span className="text-xs text-muted-foreground" title={formatDateTime(entry.created_at)}>
                    {formatRelative(entry.created_at)} · {entry.actor_email ?? "sistema"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
