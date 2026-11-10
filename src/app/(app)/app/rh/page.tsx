import type { Metadata } from "next";
import Link from "next/link";
import { Cake, CalendarClock, HandCoins, Search, UserRoundCheck, Users, Wallet } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { NoAccess } from "@/components/app/no-access";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { getHrDashboard, listEmployees } from "@/lib/hr/queries";
import { paymentTitle } from "@/lib/hr/labels";
import { dueState, FREQUENCY_LABELS, paydayLabel } from "@/lib/hr/schedule";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HrEmployeeStatus } from "@/types/hr";

export const metadata: Metadata = { title: "RH" };

type Params = { q?: string; situacao?: string };

export default async function HrPage({ searchParams: searchParamsPromise }: { searchParams: Promise<Params> }) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.view")) return <NoAccess area="o RH" />;

  const status: HrEmployeeStatus | "all" = searchParams?.situacao === "inactive" ? "inactive" : searchParams?.situacao === "all" ? "all" : "active";
  const [dashboard, employees] = await Promise.all([
    getHrDashboard(current.company.id),
    listEmployees(current.company.id, { status, search: searchParams?.q }),
  ]);
  const searching = Boolean(searchParams?.q);
  const empty = dashboard.activeCount === 0 && employees.length === 0 && !searching && status === "active";

  const filterHref = (situacao: string) => {
    const params = new URLSearchParams();
    if (searchParams?.q) params.set("q", searchParams.q);
    if (situacao !== "active") params.set("situacao", situacao);
    const qs = params.toString();
    return qs ? `/app/rh?${qs}` : "/app/rh";
  };

  return (
    <div className="prime-module-page prime-module-page--rh flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="RH"
        description="Funcionários, presença, vales e pagamentos. Controle simples para a sua equipe."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/rh/configuracoes" className={cn(buttonVariants({ variant: "outline" }))}>Configurações</Link>
            <Link href="/app/rh/pagamentos" className={cn(buttonVariants({ variant: "outline" }))}>Pagamentos</Link>
            <Link href="/app/rh/novo" className={cn(buttonVariants())}>+ Novo funcionário</Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Funcionários ativos" value={dashboard.activeCount} icon={Users} />
        <MetricCard label="A pagar" value={formatCurrency(dashboard.pendingTotal)} detail={`${dashboard.pendingPayments.length} pagamento(s) fechado(s)`} icon={HandCoins} />
        <MetricCard label="Pago neste mês" value={formatCurrency(dashboard.paidThisMonth)} icon={Wallet} />
        <MetricCard label="Pagamentos nos próximos 7 dias" value={dashboard.upcoming.length} icon={CalendarClock} />
      </div>

      {empty ? (
        <EmptyState
          title="Você ainda não tem funcionários cadastrados."
          description="Cadastre o primeiro para marcar presença, lançar vales e registrar pagamentos."
          actionLabel="Novo funcionário"
          actionHref="/app/rh/novo"
          icon={UserRoundCheck}
        />
      ) : (
        <>
          {dashboard.pendingPayments.length > 0 ? (
            <section aria-labelledby="hr-a-pagar" className="rounded-lg border">
              <h2 id="hr-a-pagar" className="border-b px-4 py-3 text-sm font-semibold">Pagamentos a fazer</h2>
              <ul className="divide-y">
                {dashboard.pendingPayments.map((payment) => {
                  const state = dueState(payment.due_on, dashboard.today);
                  return (
                    <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <Link href={`/app/rh/pagamentos/${payment.id}`} className="font-medium underline-offset-4 hover:underline">
                          {payment.employee?.full_name ?? "Funcionário"}
                        </Link>
                        <p className="text-xs text-muted-foreground">{paymentTitle(payment)} · vence em {formatDate(payment.due_on)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {state === "overdue" ? <Badge variant="danger">Atrasado</Badge> : state === "today" ? <Badge variant="warning">Hoje</Badge> : null}
                        <span className="font-semibold">{formatCurrency(payment.net_amount)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {dashboard.upcoming.length > 0 || dashboard.birthdays.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {dashboard.upcoming.length > 0 ? (
                <section aria-labelledby="hr-proximos" className="rounded-lg border">
                  <h2 id="hr-proximos" className="border-b px-4 py-3 text-sm font-semibold">Dias de pagamento (7 dias)</h2>
                  <ul className="divide-y">
                    {dashboard.upcoming.map(({ employee, payday }) => (
                      <li key={employee.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                        <Link href={`/app/rh/${employee.id}?aba=fechar`} className="underline-offset-4 hover:underline">{employee.full_name}</Link>
                        <span className="text-muted-foreground">{payday === dashboard.today ? "hoje" : formatDate(payday)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {dashboard.birthdays.length > 0 ? (
                <section aria-labelledby="hr-aniversarios" className="rounded-lg border">
                  <h2 id="hr-aniversarios" className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold"><Cake className="h-4 w-4" aria-hidden /> Aniversariantes do mês</h2>
                  <ul className="divide-y">
                    {dashboard.birthdays.map((employee) => (
                      <li key={employee.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                        <span>{employee.full_name}</span>
                        <span className="text-muted-foreground">{employee.birth_date ? `${employee.birth_date.slice(8, 10)}/${employee.birth_date.slice(5, 7)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          <ListToolbar>
            <form className="flex w-full items-center gap-2 sm:max-w-md" role="search">
              {status !== "active" ? <input type="hidden" name="situacao" value={status} /> : null}
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  defaultValue={searchParams?.q ?? ""}
                  aria-label="Buscar funcionários"
                  placeholder="Buscar funcionário..."
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button className={cn(buttonVariants({ variant: "outline" }))}>Buscar</button>
            </form>
            <nav className="flex gap-1 text-sm" aria-label="Filtrar por situação">
              {([["active", "Ativos"], ["inactive", "Inativos"], ["all", "Todos"]] as const).map(([value, label]) => (
                <Link
                  key={value}
                  href={filterHref(value)}
                  aria-current={status === value ? "page" : undefined}
                  className={cn("rounded-md px-3 py-1.5", status === value ? "bg-primary/10 font-medium text-primary-text" : "text-muted-foreground hover:bg-accent")}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </ListToolbar>

          {employees.length === 0 ? (
            <EmptyState title="Nenhum funcionário encontrado." description="Tente outra busca ou outro filtro." icon={Users} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {employees.map((employee) => (
                <li key={employee.id}>
                  <Link href={`/app/rh/${employee.id}`} className="flex h-full flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{employee.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{employee.role_title || "Sem função informada"}</p>
                      </div>
                      <Badge variant={employee.status === "active" ? "success" : "muted"}>{employee.status === "active" ? "Ativo" : "Inativo"}</Badge>
                    </div>
                    <p className="text-sm">
                      {formatCurrency(employee.base_amount)}{" "}
                      <span className="text-muted-foreground">
                        {employee.mode === "clt" ? "de salário" : employee.rate_kind === "per_day" ? "por dia" : `por período (${FREQUENCY_LABELS[employee.pay_frequency].toLowerCase()})`}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {employee.mode === "clt" ? `CLT · paga todo dia ${employee.pay_day_of_month}` : `Informal · ${FREQUENCY_LABELS[employee.pay_frequency]} · ${paydayLabel(employee)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
