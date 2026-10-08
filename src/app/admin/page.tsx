import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  Layers,
  Users,
  Wallet,
} from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformOverview, requirePlatformAdmin } from "@/lib/admin/queries";
import { USER_ROLE_LABELS } from "@/types/admin";

export const metadata = { title: "Dashboard" };

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Dashboard da plataforma. Layout em grade de cards do bloco dashboard-01 do
 * shadcn/ui (section-cards), reaproveitando o MetricCard do projeto. Só mostra
 * números com fonte confiável (get_platform_admin_overview()); o que ainda não
 * tem fonte aparece como "Disponível em breve", nunca com valores fictícios.
 */
export default async function AdminDashboardPage() {
  const [admin, overview] = await Promise.all([requirePlatformAdmin(), getPlatformOverview()]);

  const paying = overview.subscriptions_active;
  const trialing = overview.subscriptions_trialing;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Plataforma"
        title="Dashboard"
        description="Visão geral do Prime Ges: usuários, empresas, assinaturas e planos."
      />

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Usuários"
          value={overview.total_users}
          icon={Users}
          detail={`${overview.active_users} ativos · ${overview.suspended_users} suspensos · ${plural(overview.platform_admins, "admin", "admins")}`}
        />
        <MetricCard
          label="Empresas"
          value={overview.total_companies}
          icon={Building2}
          detail={`${overview.active_companies} ativas · ${overview.inactive_companies} inativas`}
        />
        <MetricCard
          label="Assinaturas com acesso"
          value={paying + trialing}
          icon={CreditCard}
          detail={`${paying} pagas · ${trialing} em teste grátis`}
        />
        <MetricCard
          label="Planos ativos"
          value={overview.active_plans}
          icon={Layers}
          detail="Disponíveis para contratação"
        />
      </section>

      <section aria-label="Situação das assinaturas" className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Assinaturas expiradas"
          value={overview.subscriptions_expired}
          detail="Acesso vencido (data de expiração passada)"
        />
        <MetricCard
          label="Assinaturas canceladas"
          value={overview.subscriptions_cancelled}
          detail="Canceladas manualmente ou pelo provedor"
        />
        <MetricCard
          label="Empresas sem assinatura"
          value={overview.companies_without_subscription}
          detail="Cadastradas sem teste nem plano"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" strokeWidth={1.75} />
              Status do sistema
            </CardTitle>
            <CardDescription>Verificado agora, durante o carregamento desta página.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Autenticação (Clerk)</span>
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3" /> Sessão válida
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Banco de dados</span>
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3" /> Respondendo
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Acesso administrativo</span>
              <Badge variant="info">{USER_ROLE_LABELS[admin.role]}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-primary" strokeWidth={1.75} />
              Em breve
            </CardTitle>
            <CardDescription>
              Indicadores que ainda não têm fonte de dados confiável e por isso não são exibidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Receita e pagamentos",
                "Usuários online agora",
                "Crescimento de usuários",
                "Crescimento de assinaturas",
              ].map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2"
                >
                  <Wallet className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
