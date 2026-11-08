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
  ClosePeriodForm,
  DeleteAdjustmentButton,
  type AttendanceDay,
} from "@/components/app/hr-forms";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import {
  getEarliestUnsettledDay,
  getEmployee,
  getLastClosedPeriodEnd,
  getPeriodPreview,
  listAdjustments,
  listPayments,
  listTimeEntries,
} from "@/lib/hr/queries";
import { setEmployeeStatusAction } from "@/lib/hr/actions";
import { ADJUSTMENT_LABELS, formatPeriod, PAYMENT_STATUS_LABELS } from "@/lib/hr/labels";
import { addDays, daysInMonth, dueState, formatDays, FREQUENCY_LABELS, nextPayday, paydayLabel, suggestPeriod, weekdayOf } from "@/lib/hr/schedule";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Funcionário" };

const TABS = [
  ["resumo", "Resumo"],
  ["presenca", "Presença"],
  ["vales", "Vales e descontos"],
  ["fechar", "Fechar período"],
  ["pagamentos", "Pagamentos"],
] as const;

const SHORT_WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const isDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const isMonth = (value: string | undefined): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

function shiftMonth(month: string, delta: number): string {
  const [year = 1970, mon = 1] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

type Params = { aba?: string; mes?: string; de?: string; ate?: string };

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
  const tab = TABS.some(([key]) => key === searchParams?.aba) ? (searchParams.aba as (typeof TABS)[number][0]) : "resumo";
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
        description={`${employee.role_title || "Sem função informada"} · ${FREQUENCY_LABELS[employee.pay_frequency]} (${paydayLabel(employee)}) · ${formatCurrency(employee.base_amount)} ${employee.rate_kind === "per_day" ? "por dia" : "por período"}`}
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
        {TABS.map(([key, label]) => (
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
        {employee.notes ? <p className="mt-3 whitespace-pre-line border-t pt-3 text-sm text-muted-foreground">{employee.notes}</p> : null}
      </section>

      <section className="rounded-lg border p-4" aria-labelledby="resumo-aberto">
        <h2 id="resumo-aberto" className="mb-3 text-sm font-semibold">Em aberto para o próximo fechamento</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Vales já pagos</dt><dd>{formatCurrency(sum("advance"))}</dd>
          <dt className="text-muted-foreground">Descontos</dt><dd>{formatCurrency(sum("deduction"))}</dd>
          <dt className="text-muted-foreground">Bônus</dt><dd>{formatCurrency(sum("bonus"))}</dd>
        </dl>
        <Link href={`${base}?aba=fechar`} className={cn(buttonVariants({ size: "sm" }), "mt-4")}>Fechar período</Link>
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
              <Link href={`/app/rh/pagamentos/${payment.id}`} className="font-medium underline-offset-4 hover:underline">{formatPeriod(payment.period_start, payment.period_end)}</Link>
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
          <h2 className="min-w-40 text-center text-sm font-semibold capitalize">{MONTH_NAMES[monthNumber - 1]} de {year}</h2>
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
