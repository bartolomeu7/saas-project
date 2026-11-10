import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { NoAccess } from "@/components/app/no-access";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AdjustmentForm,
  AttendanceDays,
  AttendanceRangeForm,
  CancelVacationButton,
  ClosePayrollForm,
  ClosePeriodForm,
  GenerateVacationPayButton,
  ScheduleVacationForm,
  ThirteenthButton,
  DeleteAdjustmentButton,
  type AttendanceDay,
} from "@/components/app/hr-forms";
import { getCurrentCompany } from "@/lib/companies/queries";
import { parseMoneyInput } from "@/lib/parse-money";
import { can } from "@/lib/permissions/matrix";
import {
  getEarliestUnsettledDay,
  getEmployee,
  getEmployeeClt,
  getHrSettings,
  getPayrollTables,
  hasPaymentInMonth,
  getLastClosedPeriodEnd,
  getPeriodPreview,
  listAdjustments,
  listPayments,
  listTimeEntries,
  listVacations,
} from "@/lib/hr/queries";
import { setEmployeeStatusAction } from "@/lib/hr/actions";
import { buildPayroll, MONTH_PATTERN } from "@/lib/hr/payroll-service";
import { ADJUSTMENT_LABELS, CONTRACT_TYPE_LABELS, formatPeriod, paymentTitle, PAYMENT_STATUS_LABELS } from "@/lib/hr/labels";
import { acquisitionPeriods, calcThirteenth, thirteenthAvos, thirteenthDeadlines } from "@/lib/hr/payroll";
import { addDays, daysInMonth, dueState, formatDays, FREQUENCY_LABELS, nextPayday, paydayLabel, suggestPeriod, weekdayOf } from "@/lib/hr/schedule";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Funcionário" };

const INFORMAL_TABS = [
  ["resumo", "Resumo"],
  ["presenca", "Presença"],
  ["vales", "Vales e descontos"],
  ["fechar", "Fechar período"],
  ["pagamentos", "Pagamentos"],
] as const;

const CLT_TABS = [
  ["resumo", "Resumo"],
  ["folha", "Folha do mês"],
  ["ferias", "Férias e 13º"],
  ["vales", "Vales, descontos e bônus"],
  ["pagamentos", "Pagamentos"],
] as const;

type TabKey = (typeof INFORMAL_TABS)[number][0] | (typeof CLT_TABS)[number][0];

const SHORT_WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const isDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const isMonth = (value: string | undefined): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

function shiftMonth(month: string, delta: number): string {
  const [year = 1970, mon = 1] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

type Params = { aba?: string; mes?: string; de?: string; ate?: string; he50?: string; he100?: string; faltas?: string; ferias?: string; ano?: string };

export default async function HrEmployeePage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.view")) return <NoAccess area="o RH" />;
  const employee = await getEmployee(current.company.id, id);
  if (!employee) notFound();

  const today = todayDateSaoPaulo();
  const isClt = employee.mode === "clt";
  const tabs: readonly (readonly [TabKey, string])[] = isClt ? CLT_TABS : INFORMAL_TABS;
  const tab: TabKey = tabs.some(([key]) => key === searchParams?.aba) ? (searchParams.aba as TabKey) : "resumo";
  const base = `/app/rh/${employee.id}`;
  const deactivate = setEmployeeStatusAction.bind(null, employee.id, employee.status === "active" ? "inactive" : "active");

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/app/rh" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para o RH</Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {employee.full_name}
            <Badge variant={employee.status === "active" ? "success" : "muted"}>{employee.status === "active" ? "Ativo" : "Inativo"}</Badge>
          </span>
        }
        description={
          isClt
            ? `${employee.role_title || "Sem função informada"} · CLT · salário ${formatCurrency(employee.base_amount)} · paga todo dia ${employee.pay_day_of_month}`
            : `${employee.role_title || "Sem função informada"} · ${FREQUENCY_LABELS[employee.pay_frequency]} (${paydayLabel(employee)}) · ${formatCurrency(employee.base_amount)} ${employee.rate_kind === "per_day" ? "por dia" : "por período"}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/editar`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><Pencil className="h-4 w-4" aria-hidden /> Editar</Link>
            <form action={deactivate}>
              <Button type="submit" variant="outline">{employee.status === "active" ? "Inativar" : "Reativar"}</Button>
            </form>
          </div>
        }
      />

      <nav aria-label="Seções do funcionário" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={key === "resumo" ? base : `${base}?aba=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "resumo" ? <SummaryTab employeeId={employee.id} companyId={current.company.id} employee={employee} today={today} base={base} /> : null}
      {tab === "ferias" && isClt ? (
        <VacationTab
          employee={employee}
          companyId={current.company.id}
          today={today}
          base={base}
          year={/^\d{4}$/.test(searchParams?.ano ?? "") && Number(searchParams.ano) <= Number(today.slice(0, 4)) && Number(searchParams.ano) >= 2000 ? Number(searchParams.ano) : Number(today.slice(0, 4))}
        />
      ) : null}
      {tab === "folha" && isClt ? (
        <PayrollTab
          employee={employee}
          companyId={current.company.id}
          today={today}
          base={base}
          month={MONTH_PATTERN.test(searchParams?.mes ?? "") ? (searchParams.mes as string) : today.slice(0, 7)}
          overtime50={searchParams?.he50 ?? ""}
          overtime100={searchParams?.he100 ?? ""}
          absences={searchParams?.faltas ?? ""}
          vacationDays={searchParams?.ferias ?? ""}
        />
      ) : null}
      {tab === "presenca" ? <AttendanceTab employeeId={employee.id} month={isMonth(searchParams?.mes) ? searchParams.mes : today.slice(0, 7)} today={today} base={base} /> : null}
      {tab === "vales" ? <AdjustmentsTab employeeId={employee.id} today={today} /> : null}
      {tab === "fechar" ? (
        <ClosePeriodTab
          employeeId={employee.id}
          today={today}
          base={base}
          requestedStart={isDate(searchParams?.de) ? searchParams.de : undefined}
          requestedEnd={isDate(searchParams?.ate) ? searchParams.ate : undefined}
          nextDue={nextPayday(employee, today)}
        />
      ) : null}
      {tab === "pagamentos" ? <PaymentsTab companyId={current.company.id} employeeId={employee.id} today={today} /> : null}
    </div>
  );
}

async function SummaryTab({ employeeId, companyId, employee, today, base }: { employeeId: string; companyId: string; employee: NonNullable<Awaited<ReturnType<typeof getEmployee>>>; today: string; base: string }) {
  const [payments, adjustments] = await Promise.all([
    listPayments(companyId, { employeeId, limit: 5 }),
    listAdjustments(employeeId, { limit: 50 }),
  ]);
  const open = adjustments.filter((row) => row.payment_id === null);
  const sum = (kind: string) => open.filter((row) => row.kind === kind).reduce((total, row) => total + row.amount, 0);
  const pending = payments.filter((payment) => payment.status === "pending");
  const payday = nextPayday(employee, today);
  const clt = employee.mode === "clt" ? await getEmployeeClt(employeeId) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-lg border p-4" aria-labelledby="resumo-dados">
        <h2 id="resumo-dados" className="mb-3 text-sm font-semibold">Dados</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nascimento</dt><dd>{employee.birth_date ? formatDate(employee.birth_date) : "—"}</dd>
          <dt className="text-muted-foreground">Começou em</dt><dd>{employee.started_on ? formatDate(employee.started_on) : "—"}</dd>
          <dt className="text-muted-foreground">Telefone</dt><dd>{employee.phone || "—"}</dd>
          <dt className="text-muted-foreground">Chave Pix</dt><dd className="break-all">{employee.pix_key || "—"}</dd>
          <dt className="text-muted-foreground">Próximo pagamento</dt><dd>{employee.status === "active" ? (payday === today ? "hoje" : formatDate(payday)) : "—"}</dd>
        </dl>
        {clt ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm">
            <dt className="text-muted-foreground">Contrato</dt>
            <dd>{CONTRACT_TYPE_LABELS[clt.contract_type]}{clt.experience_days ? ` (${clt.experience_days} dias)` : ""}</dd>
            <dt className="text-muted-foreground">Jornada</dt><dd>{clt.weekly_hours} h por semana</dd>
            <dt className="text-muted-foreground">Dependentes (IR)</dt><dd>{clt.dependents}</dd>
            <dt className="text-muted-foreground">Vale-transporte</dt>
            <dd>{clt.vt_enabled ? (clt.vt_monthly_cost ? `Sim (custo ${formatCurrency(clt.vt_monthly_cost)})` : "Sim") : "Não"}</dd>
            {clt.contract_end_on ? (<><dt className="text-muted-foreground">Fim do contrato</dt><dd>{formatDate(clt.contract_end_on)}</dd></>) : null}
          </dl>
        ) : null}
        {employee.notes ? <p className="mt-3 whitespace-pre-line border-t pt-3 text-sm text-muted-foreground">{employee.notes}</p> : null}
      </section>

      <section className="rounded-lg border p-4" aria-labelledby="resumo-aberto">
        <h2 id="resumo-aberto" className="mb-3 text-sm font-semibold">Em aberto para o próximo fechamento</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Vales já pagos</dt><dd>{formatCurrency(sum("advance"))}</dd>
          <dt className="text-muted-foreground">Descontos</dt><dd>{formatCurrency(sum("deduction"))}</dd>
          <dt className="text-muted-foreground">Bônus</dt><dd>{formatCurrency(sum("bonus"))}</dd>
        </dl>
        <Link href={employee.mode === "clt" ? `${base}?aba=folha` : `${base}?aba=fechar`} className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
          {employee.mode === "clt" ? "Ver folha do mês" : "Fechar período"}
        </Link>
      </section>

      <section className="rounded-lg border lg:col-span-2" aria-labelledby="resumo-pagamentos">
        <h2 id="resumo-pagamentos" className="border-b px-4 py-3 text-sm font-semibold">Últimos pagamentos</h2>
        {payments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
        ) : (
          <PaymentList payments={payments} today={today} />
        )}
        {pending.length > 0 ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">Há pagamento fechado aguardando você pagar.</p> : null}
      </section>
    </div>
  );
}

function PaymentList({ payments, today }: { payments: Awaited<ReturnType<typeof listPayments>>; today: string }) {
  return (
    <ul className="divide-y">
      {payments.map((payment) => {
        const state = payment.status === "pending" ? dueState(payment.due_on, today) : null;
        return (
          <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <Link href={`/app/rh/pagamentos/${payment.id}`} className="font-medium underline-offset-4 hover:underline">{paymentTitle(payment)}</Link>
              <p className="text-xs text-muted-foreground">
                {payment.status === "paid" && payment.paid_on ? `Pago em ${formatDate(payment.paid_on)}` : `Vence em ${formatDate(payment.due_on)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {state === "overdue" ? <Badge variant="danger">Atrasado</Badge> : null}
              <Badge variant={payment.status === "paid" ? "success" : payment.status === "pending" ? "warning" : "muted"}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
              <span className="font-semibold">{formatCurrency(payment.net_amount)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function AttendanceTab({ employeeId, month, today, base }: { employeeId: string; month: string; today: string; base: string }) {
  const [yearText = "1970", monthText = "01"] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const total = daysInMonth(year, monthNumber);
  const first = `${month}-01`;
  const last = `${month}-${String(total).padStart(2, "0")}`;
  const entries = await listTimeEntries(employeeId, first, last);
  const byDate = new Map(entries.map((entry) => [entry.work_date, entry]));

  const days: AttendanceDay[] = Array.from({ length: total }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const entry = byDate.get(date);
    const weekday = weekdayOf(date);
    return {
      date,
      label: `${SHORT_WEEKDAYS[weekday]} ${String(index + 1).padStart(2, "0")}`,
      quantity: entry ? entry.quantity : null,
      locked: Boolean(entry?.payment_id),
      future: date > today,
      weekend: weekday === 0 || weekday === 6,
    };
  });

  const worked = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const absences = entries.filter((entry) => entry.quantity === 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={`${base}?aba=presenca&mes=${shiftMonth(month, -1)}`} aria-label="Mês anterior" className={cn(buttonVariants({ variant: "outline", size: "icon" }))}><ChevronLeft className="h-4 w-4" /></Link>
          <h2 className="min-w-40 text-center text-sm font-semibold first-letter:uppercase">{MONTH_NAMES[monthNumber - 1]} de {year}</h2>
          <Link href={`${base}?aba=presenca&mes=${shiftMonth(month, 1)}`} aria-label="Próximo mês" className={cn(buttonVariants({ variant: "outline", size: "icon" }))}><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <p className="text-sm text-muted-foreground">{formatDays(worked)} dia(s) trabalhado(s) · {absences} falta(s)</p>
      </div>
      <AttendanceRangeForm employeeId={employeeId} today={today} />
      <AttendanceDays employeeId={employeeId} days={days} />
    </div>
  );
}

async function AdjustmentsTab({ employeeId, today }: { employeeId: string; today: string }) {
  const adjustments = await listAdjustments(employeeId);
  return (
    <div className="flex flex-col gap-4">
      <AdjustmentForm employeeId={employeeId} today={today} />
      <section className="rounded-lg border" aria-labelledby="adj-historico">
        <h2 id="adj-historico" className="border-b px-4 py-3 text-sm font-semibold">Histórico</h2>
        {adjustments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum vale, desconto ou bônus ainda.</p>
        ) : (
          <ul className="divide-y">
            {adjustments.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ADJUSTMENT_LABELS[row.kind]}{row.description ? ` · ${row.description}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(row.occurred_on)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.payment_id ? "muted" : "info"}>{row.payment_id ? "Já acertado" : "Em aberto"}</Badge>
                  <span className={cn("font-semibold", row.kind === "bonus" ? "text-success" : "")}>{row.kind === "bonus" ? "+" : "−"} {formatCurrency(row.amount)}</span>
                  {!row.payment_id && row.kind !== "advance" ? <DeleteAdjustmentButton adjustmentId={row.id} employeeId={employeeId} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function ClosePeriodTab({ employeeId, today, base, requestedStart, requestedEnd, nextDue }: { employeeId: string; today: string; base: string; requestedStart?: string; requestedEnd?: string; nextDue: string }) {
  const [lastClosedEnd, earliestUnsettled] = await Promise.all([getLastClosedPeriodEnd(employeeId), getEarliestUnsettledDay(employeeId)]);
  const suggested = suggestPeriod({ lastClosedEnd, earliestUnsettled, today });
  const start = requestedStart ?? suggested.start;
  const end = requestedEnd ?? suggested.end;
  const valid = start <= end && end <= today && addDays(start, 92) >= end;
  const preview = valid ? await getPeriodPreview(employeeId, start, end) : null;
  const due = nextDue < end ? end : nextDue;

  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3 sm:items-end">
        <input type="hidden" name="aba" value="fechar" />
        <div className="flex flex-col gap-2">
          <Label htmlFor="de">Início do período</Label>
          <Input id="de" name="de" type="date" defaultValue={start} max={today} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ate">Fim do período</Label>
          <Input id="ate" name="ate" type="date" defaultValue={end} max={today} required />
        </div>
        <Button type="submit" variant="outline">Calcular</Button>
      </form>

      {!valid ? (
        <Alert variant="destructive">Período inválido: o início deve ser antes do fim, o fim não pode ser no futuro e o período tem no máximo 93 dias.</Alert>
      ) : !preview ? (
        <Alert variant="destructive">Não foi possível calcular agora. Tente de novo.</Alert>
      ) : (
        <>
          <section className="rounded-lg border p-4" aria-labelledby="fechar-conta">
            <h2 id="fechar-conta" className="mb-3 text-sm font-semibold">Conta do período {formatPeriod(start, end)}</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Dias trabalhados</dt><dd>{formatDays(preview.days_worked)}</dd>
              <dt>Valor bruto</dt><dd>{formatCurrency(preview.gross)}</dd>
              <dt className="text-muted-foreground">+ Bônus em aberto</dt><dd>{formatCurrency(preview.bonus)}</dd>
              <dt className="text-muted-foreground">− Descontos em aberto</dt><dd>{formatCurrency(preview.deductions)}</dd>
              <dt className="text-muted-foreground">− Vales já pagos</dt><dd>{formatCurrency(preview.advances)}</dd>
              <dt className="border-t pt-2 font-semibold">Líquido a pagar</dt><dd className="border-t pt-2 text-lg font-semibold">{formatCurrency(preview.net)}</dd>
            </dl>
          </section>
          {preview.has_overlap ? (
            <Alert variant="destructive">Já existe um pagamento para este funcionário que cobre parte deste período. Ajuste as datas ou cancele o pagamento antigo.</Alert>
          ) : preview.net < 0 ? (
            <Alert variant="destructive">Vales e descontos passam do valor a pagar neste período. Ajuste o período ou revise os lançamentos.</Alert>
          ) : preview.gross + preview.bonus <= 0 ? (
            <EmptyState title="Nada a pagar neste período." description="Marque a presença dos dias trabalhados ou escolha outro período." />
          ) : (
            <ClosePeriodForm employeeId={employeeId} start={start} end={end} dueOn={due} />
          )}
          <p className="text-xs text-muted-foreground">Ao fechar, os dias e lançamentos do período ficam travados no pagamento. Você paga depois, na tela do pagamento. <Link href={`${base}?aba=presenca`} className="underline underline-offset-4">Conferir presença</Link></p>
        </>
      )}
    </div>
  );
}

async function PaymentsTab({ companyId, employeeId, today }: { companyId: string; employeeId: string; today: string }) {
  const payments = await listPayments(companyId, { employeeId });
  return (
    <section className="rounded-lg border" aria-labelledby="pag-historico">
      <h2 id="pag-historico" className="border-b px-4 py-3 text-sm font-semibold">Pagamentos deste funcionário</h2>
      {payments.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum pagamento ainda.</p> : <PaymentList payments={payments} today={today} />}
    </section>
  );
}

const num = (value: string): number | null => (value.trim() === "" ? 0 : parseMoneyInput(value));

function Line({ label, value, muted, strong, negative }: { label: string; value: number; muted?: boolean; strong?: boolean; negative?: boolean }) {
  return (
    <>
      <dt className={cn(muted && "text-muted-foreground", strong && "border-t pt-2 font-semibold")}>{label}</dt>
      <dd className={cn("text-right", strong && "border-t pt-2 text-lg font-semibold")}>{negative ? "− " : ""}{formatCurrency(value)}</dd>
    </>
  );
}

async function PayrollTab({
  employee,
  companyId,
  today,
  base,
  month,
  overtime50,
  overtime100,
  absences,
  vacationDays,
}: {
  employee: NonNullable<Awaited<ReturnType<typeof getEmployee>>>;
  companyId: string;
  today: string;
  base: string;
  month: string;
  overtime50: string;
  overtime100: string;
  absences: string;
  vacationDays: string;
}) {
  const [clt, settings] = await Promise.all([getEmployeeClt(employee.id), getHrSettings(companyId)]);
  if (!clt) {
    return (
      <Alert variant="destructive">
        Faltam os dados do contrato (jornada e tipo). <Link href={`${base}/editar`} className="underline underline-offset-4">Complete o cadastro</Link>.
      </Alert>
    );
  }

  const he50 = num(overtime50);
  const he100 = num(overtime100);
  const abs = num(absences);
  const vac = num(vacationDays);
  const inputsValid = he50 !== null && he100 !== null && abs !== null && vac !== null && he50 <= 200 && he100 <= 200 && abs + vac <= 31;
  const built = inputsValid
    ? await buildPayroll({ employee, clt, settings, month, overtime50: he50, overtime100: he100, absenceDays: abs, vacationDays: vac })
    : null;
  const monthStart = `${month}-01`;
  const [yearText = "1970", monthText = "01"] = month.split("-");
  const monthEnd = `${month}-${String(daysInMonth(Number(yearText), Number(monthText))).padStart(2, "0")}`;
  const futureMonth = monthStart > today;
  const alreadyClosed = await hasPaymentInMonth(employee.id, monthStart, monthEnd);
  const due = nextPayday(employee, monthEnd);

  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-5 sm:items-end">
        <input type="hidden" name="aba" value="folha" />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="mes">Mês da folha</Label>
          <Input id="mes" name="mes" type="month" defaultValue={month} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="he50">Horas extras 50%</Label>
          <Input id="he50" name="he50" inputMode="decimal" defaultValue={overtime50} placeholder="0" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="he100">Horas extras 100%</Label>
          <Input id="he100" name="he100" inputMode="decimal" defaultValue={overtime100} placeholder="0" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="faltas">Faltas (dias)</Label>
          <Input id="faltas" name="faltas" inputMode="decimal" defaultValue={absences} placeholder="0" />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="ferias">Dias de férias gozados no mês</Label>
          <Input id="ferias" name="ferias" inputMode="decimal" defaultValue={vacationDays} placeholder="0" />
        </div>
        <Button type="submit" variant="outline" className="sm:col-span-3 sm:w-fit">Calcular</Button>
      </form>

      <Alert variant="warning">
        <strong>Estimativa para controle interno.</strong> Não substitui o holerite oficial, o eSocial nem o seu contador. Não considera DSR sobre horas extras e faltas, adicional noturno, insalubridade ou periculosidade.
      </Alert>

      {!inputsValid ? (
        <Alert variant="destructive">Horas extras (até 200), faltas e dias de férias (juntos até 31) devem ser números.</Alert>
      ) : !built ? null : !built.ok ? (
        <Alert variant="destructive">{built.error}</Alert>
      ) : (
        <>
          {built.outdated ? (
            <Alert variant="destructive">
              As tabelas de INSS e Imposto de Renda cadastradas são de {built.versions.inss.slice(0, 4)} e esta folha é de {yearText}. Os valores podem estar defasados — peça a atualização das tabelas antes de usar este cálculo.
            </Alert>
          ) : null}
          {employee.base_amount < built.input.tables.params.minimum_wage ? (
            <Alert variant="warning">O salário está abaixo do salário mínimo ({formatCurrency(built.input.tables.params.minimum_wage)}).</Alert>
          ) : null}
          <section className="rounded-lg border p-4" aria-labelledby="folha-conta">
            <h2 id="folha-conta" className="mb-3 text-sm font-semibold">Holerite estimado — {MONTH_NAMES[Number(monthText) - 1]} de {yearText}</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <Line label="Salário" value={built.result.salary} />
              <Line label={`Horas extras 50% (${formatDays(he50 ?? 0)} h)`} value={built.result.overtime50} muted />
              <Line label={`Horas extras 100% (${formatDays(he100 ?? 0)} h)`} value={built.result.overtime100} muted />
              <Line label="Bônus em aberto" value={built.result.bonus} muted />
              <Line label={`Faltas (${formatDays(abs ?? 0)} dia(s))`} value={built.result.absences} muted negative />
              <Line label={`Dias de férias no mês (${formatDays(vac ?? 0)}) — pagos no recibo de férias`} value={built.result.vacation} muted negative />
              <Line label="Total bruto" value={built.result.gross} strong />
              <Line label="INSS" value={built.result.inss} muted negative />
              <Line label="Imposto de Renda (IRRF)" value={built.result.irrf} muted negative />
              <Line label="Vale-transporte" value={built.result.vt} muted negative />
              <Line label="Outros descontos em aberto" value={built.result.otherDeductions} muted negative />
              <Line label="Vales já pagos" value={built.result.advances} muted negative />
              <Line label="Líquido a pagar" value={built.result.net} strong />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              IRRF: base {formatCurrency(built.result.irrfDetail.base)} ({built.result.irrfDetail.usedSimplified ? "desconto simplificado" : "INSS e dependentes"}); imposto da tabela {formatCurrency(built.result.irrfDetail.tableTax)}; redução da Lei 15.270 de {formatCurrency(built.result.irrfDetail.reduction)}. Tabelas vigentes desde {formatDate(built.versions.inss)} (INSS) e {formatDate(built.versions.irrf)} (IRRF).
            </p>
          </section>

          <section className="rounded-lg border p-4" aria-labelledby="folha-empresa">
            <h2 id="folha-empresa" className="mb-3 text-sm font-semibold">Custo para a empresa (estimativa)</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <Line label="Total bruto" value={built.result.gross} muted />
              <Line label="FGTS (8%)" value={built.result.employer.fgts} muted />
              <Line label="INSS patronal" value={built.result.employer.inss} muted />
              <Line label="Custo total do mês" value={built.result.employer.totalCost} strong />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {built.result.employer.inssNote}{" "}
              <Link href="/app/rh/configuracoes" className="underline underline-offset-4">Mudar o regime da empresa</Link>. FGTS, INSS e IRRF são recolhidos por você nas guias oficiais; o Prime Ges não lança esses recolhimentos no Financeiro.
            </p>
          </section>

          {futureMonth ? (
            <Alert variant="destructive">Este mês ainda não começou: dá para ver a estimativa, mas não fechar a folha.</Alert>
          ) : alreadyClosed ? (
            <Alert variant="warning">Este mês já tem um pagamento fechado. Veja em <Link href={`${base}?aba=pagamentos`} className="underline underline-offset-4">Pagamentos</Link>.</Alert>
          ) : built.result.net < 0 ? (
            <Alert variant="destructive">Descontos e vales passam do valor a pagar. Revise os lançamentos.</Alert>
          ) : built.result.gross <= 0 ? (
            <EmptyState title="Nada a pagar neste mês." description="O total bruto está zerado." />
          ) : (
            <ClosePayrollForm employeeId={employee.id} month={month} overtime50={overtime50} overtime100={overtime100} absences={absences} vacationDays={vacationDays} dueOn={due} />
          )}
        </>
      )}
    </div>
  );
}

const STATE_BADGES = {
  acquiring: { label: "Em aquisição", variant: "muted" },
  available: { label: "Pode tirar férias", variant: "success" },
  expiring: { label: "Vencendo", variant: "warning" },
  overdue: { label: "Vencidas", variant: "danger" },
} as const;

const dmy = (iso: string) => iso.split("-").reverse().join("/");

async function VacationTab({
  employee,
  companyId,
  today,
  base,
  year,
}: {
  employee: NonNullable<Awaited<ReturnType<typeof getEmployee>>>;
  companyId: string;
  today: string;
  base: string;
  year: number;
}) {
  if (!employee.started_on) {
    return (
      <Alert variant="warning">
        Informe a <strong>data de admissão</strong> para controlar férias e 13º. <Link href={`${base}/editar`} className="underline underline-offset-4">Editar cadastro</Link>.
      </Alert>
    );
  }
  const [vacations, payments, clt] = await Promise.all([
    listVacations(employee.id),
    listPayments(companyId, { employeeId: employee.id, limit: 200 }),
    getEmployeeClt(employee.id),
  ]);
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const periods = acquisitionPeriods(employee.started_on, today);

  const periodRows = periods.map((period) => {
    const rows = vacations.filter((row) => row.acquisition_start === period.start);
    const entitled = rows[0]?.entitled_days ?? 30;
    const scheduled = rows.reduce((sum, row) => sum + row.days, 0);
    return { period, entitled, scheduled, remaining: entitled - scheduled };
  });
  const schedulable = periodRows.filter((row) => row.period.state !== "acquiring" && row.remaining >= 5);

  // 13º
  const avos = thirteenthAvos(employee.started_on, year, employee.status === "inactive" ? employee.ended_on : null);
  const loaded = await getPayrollTables(`${year}-12-01`);
  const thirteenth = loaded && clt && avos > 0 ? calcThirteenth({ salary: employee.base_amount, avos, dependents: clt.dependents, tables: loaded.tables }) : null;
  const deadlines = thirteenthDeadlines(year);
  const thirteenthPayments = payments.filter((payment) => payment.kind === "thirteenth" && Number(payment.calc?.year) === year);
  const installment = (n: number) => thirteenthPayments.find((payment) => Number(payment.calc?.installment) === n);
  const currentYear = Number(today.slice(0, 4));

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="warning">
        <strong>Estimativas para controle interno.</strong> Não substituem o recibo oficial nem o contador. Não há venda de dias (abono pecuniário) nem média de variáveis. INSS e IRRF das férias são calculados isoladamente do salário.
      </Alert>

      <section className="rounded-lg border" aria-labelledby="ferias-periodos">
        <h2 id="ferias-periodos" className="border-b px-4 py-3 text-sm font-semibold">Períodos aquisitivos</h2>
        <ul className="divide-y">
          {[...periodRows].reverse().map(({ period, entitled, scheduled }) => {
            const badge = STATE_BADGES[period.state];
            return (
              <li key={period.start} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{dmy(period.start)} a {dmy(period.end)}</p>
                  <p className="text-xs text-muted-foreground">
                    {period.state === "acquiring"
                      ? "Ainda não completou 12 meses."
                      : period.state === "overdue"
                        ? `Prazo para gozar venceu em ${dmy(period.concessiveEnd)}. Férias vencidas podem ser pagas em dobro.`
                        : `Pode gozar até ${dmy(period.concessiveEnd)}${period.daysToExpire !== null ? ` (${period.daysToExpire} dia(s))` : ""}.`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{scheduled} de {entitled} dias programados</span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border" aria-labelledby="ferias-programadas">
        <h2 id="ferias-programadas" className="border-b px-4 py-3 text-sm font-semibold">Férias programadas</h2>
        {vacations.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma férias programada.</p>
        ) : (
          <ul className="divide-y">
            {vacations.map((vacation) => {
              const payment = vacation.payment_id ? paymentById.get(vacation.payment_id) : undefined;
              const end = addDays(vacation.start_on, vacation.days - 1);
              return (
                <li key={vacation.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{dmy(vacation.start_on)} a {dmy(end)} · {vacation.days} dias</p>
                    {vacation.notes ? <p className="text-xs text-muted-foreground">{vacation.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {payment ? (
                      <>
                        <Badge variant={payment.status === "paid" ? "success" : "warning"}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
                        <span className="font-semibold">{formatCurrency(payment.net_amount)}</span>
                        <Link href={`/app/rh/pagamentos/${payment.id}`} className="text-xs underline underline-offset-4">Ver pagamento</Link>
                      </>
                    ) : (
                      <>
                        <Badge variant="muted">Sem pagamento</Badge>
                        <GenerateVacationPayButton vacationId={vacation.id} employeeId={employee.id} />
                        <CancelVacationButton vacationId={vacation.id} employeeId={employee.id} />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {schedulable.length > 0 ? (
        <section aria-labelledby="ferias-programar" className="flex flex-col gap-3">
          <h2 id="ferias-programar" className="text-sm font-semibold">Programar férias</h2>
          <ScheduleVacationForm
            employeeId={employee.id}
            minStart={addDays(schedulable[0]?.period.end ?? today, 1)}
            periods={schedulable.map((row) => ({
              start: row.period.start,
              label: `${dmy(row.period.start)} a ${dmy(row.period.end)}`,
              remaining: row.remaining,
              entitled: row.entitled,
              scheduled: vacations.filter((item) => item.acquisition_start === row.period.start).map((item) => item.days),
              minStart: addDays(row.period.end, 1),
            }))}
          />
        </section>
      ) : null}

      <section className="rounded-lg border" aria-labelledby="decimo-terceiro">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="decimo-terceiro" className="text-sm font-semibold">13º salário de {year}</h2>
          <nav className="flex gap-2 text-xs" aria-label="Ano do 13º">
            <Link href={`${base}?aba=ferias&ano=${year - 1}`} className="underline underline-offset-4">{year - 1}</Link>
            {year < currentYear ? <Link href={`${base}?aba=ferias&ano=${year + 1}`} className="underline underline-offset-4">{year + 1}</Link> : null}
          </nav>
        </div>
        {!thirteenth ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {avos === 0 ? "Sem avos de 13º neste ano." : !clt ? "Complete o cadastro CLT do funcionário." : "Tabelas de INSS/IRRF indisponíveis para este ano."}
          </p>
        ) : (
          <div className="flex flex-col gap-4 p-4 text-sm">
            <p>
              <strong>{avos}/12 avos</strong> sobre o salário de {formatCurrency(employee.base_amount)} = <strong>{formatCurrency(thirteenth.total)}</strong>. Mês trabalhado com 15 dias ou mais conta como mês inteiro.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <p className="font-medium">1ª parcela — até {dmy(deadlines.first)}</p>
                <p>{formatCurrency(thirteenth.firstInstallment)} <span className="text-xs text-muted-foreground">(metade, sem descontos)</span></p>
                {installment(1) ? (
                  <p className="text-xs">
                    <Badge variant={installment(1)?.status === "paid" ? "success" : "warning"}>{PAYMENT_STATUS_LABELS[installment(1)!.status]}</Badge>{" "}
                    <Link href={`/app/rh/pagamentos/${installment(1)!.id}`} className="underline underline-offset-4">Ver pagamento</Link>
                  </p>
                ) : (
                  <ThirteenthButton employeeId={employee.id} year={year} installment={1} label="Gerar 1ª parcela" />
                )}
              </div>
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <p className="font-medium">2ª parcela — até {dmy(deadlines.second)}</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Complemento (bruto)</dt><dd>{formatCurrency(thirteenth.secondGross)}</dd>
                  <dt className="text-muted-foreground">INSS do 13º</dt><dd>− {formatCurrency(thirteenth.inss)}</dd>
                  <dt className="text-muted-foreground">IRRF do 13º</dt><dd>− {formatCurrency(thirteenth.irrf)}</dd>
                  <dt className="font-medium">Líquido</dt><dd className="font-medium">{formatCurrency(thirteenth.secondNet)}</dd>
                </dl>
                {installment(2) ? (
                  <p className="text-xs">
                    <Badge variant={installment(2)?.status === "paid" ? "success" : "warning"}>{PAYMENT_STATUS_LABELS[installment(2)!.status]}</Badge>{" "}
                    <Link href={`/app/rh/pagamentos/${installment(2)!.id}`} className="underline underline-offset-4">Ver pagamento</Link>
                  </p>
                ) : (
                  <ThirteenthButton employeeId={employee.id} year={year} installment={2} askFirstElsewhere={!installment(1)} label="Gerar 2ª parcela" />
                )}
              </div>
            </div>
            {loaded?.outdated ? (
              <Alert variant="destructive">
                As tabelas de INSS e Imposto de Renda cadastradas são de {loaded.versions.inss.slice(0, 4)} e este 13º é de {year}. Os valores podem estar defasados — peça a atualização das tabelas.
              </Alert>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Salário fixo (sem média de horas extras/comissões). IRRF do 13º calculado só com INSS e dependentes e a redução da Lei 15.270. FGTS de 8% sobre o 13º (custo da empresa): {formatCurrency(thirteenth.fgts)}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
