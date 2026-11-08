import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { addDays, hasBirthdayInMonth, nextPayday } from "@/lib/hr/schedule";
import type { PayrollTables } from "@/lib/hr/payroll";
import type {
  HrAdjustment,
  HrEmployee,
  HrEmployeeClt,
  HrSettings,
  HrEmployeeStatus,
  HrPaymentStatus,
  HrPaymentWithEmployee,
  HrPayment,
  HrPeriodPreview,
  HrTimeEntry,
} from "@/types/hr";

// As tabelas de RH ainda não estão nos tipos gerados do Supabase; o banco (RLS) é a barreira real.
const db = (client: Awaited<ReturnType<typeof createSessionClient>>) => client as any;

const num = (value: unknown) => Number(value ?? 0);

function normalizeEmployee(row: any): HrEmployee {
  return { ...row, base_amount: num(row.base_amount) } as HrEmployee;
}

function normalizePayment(row: any): HrPayment {
  return {
    ...row,
    kind: row.kind ?? "period",
    reference_month: row.reference_month ?? null,
    calc: row.calc ?? null,
    days_worked: num(row.days_worked),
    gross_amount: num(row.gross_amount),
    bonus_amount: num(row.bonus_amount),
    deductions_amount: num(row.deductions_amount),
    advances_amount: num(row.advances_amount),
    net_amount: num(row.net_amount),
  } as HrPayment;
}

export async function listEmployees(
  companyId: string,
  options: { status?: HrEmployeeStatus | "all"; search?: string } = {}
): Promise<HrEmployee[]> {
  const supabase = db(await createSessionClient());
  let query = supabase.from("hr_employees").select("*").eq("company_id", companyId).order("full_name");
  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  const term = (options.search ?? "").trim().replace(/[,()\\"]/g, "").replace(/[%_]/g, "\\$&");
  if (term) query = query.or(`full_name.ilike.%${term}%,role_title.ilike.%${term}%`);
  const { data, error } = await query;
  return error ? [] : ((data ?? []) as any[]).map(normalizeEmployee);
}

export async function getEmployee(companyId: string, id: string): Promise<HrEmployee | null> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase.from("hr_employees").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  return error || !data ? null : normalizeEmployee(data);
}

export async function listPayments(
  companyId: string,
  options: { status?: HrPaymentStatus | "all"; employeeId?: string; limit?: number } = {}
): Promise<HrPaymentWithEmployee[]> {
  const supabase = db(await createSessionClient());
  let query = supabase
    .from("hr_payments")
    .select("*, employee:hr_employees(id, full_name)")
    .eq("company_id", companyId)
    .order("due_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  if (options.employeeId) query = query.eq("employee_id", options.employeeId);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as any[]).map((row) => ({ ...normalizePayment(row), employee: row.employee ?? null }));
}

export async function getPayment(companyId: string, id: string): Promise<HrPaymentWithEmployee | null> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase
    .from("hr_payments")
    .select("*, employee:hr_employees(id, full_name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return { ...normalizePayment(data), employee: (data as any).employee ?? null };
}

export async function listTimeEntries(employeeId: string, from: string, to: string): Promise<HrTimeEntry[]> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase
    .from("hr_time_entries")
    .select("id, employee_id, work_date, quantity, payment_id")
    .eq("employee_id", employeeId)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: true });
  return error ? [] : ((data ?? []) as any[]).map((row) => ({ ...row, quantity: num(row.quantity) }) as HrTimeEntry);
}

/** Primeiro dia com presença marcada que ainda não entrou em nenhum pagamento (para sugerir o início do período). */
export async function getEarliestUnsettledDay(employeeId: string): Promise<string | null> {
  const supabase = db(await createSessionClient());
  const { data } = await supabase
    .from("hr_time_entries")
    .select("work_date")
    .eq("employee_id", employeeId)
    .is("payment_id", null)
    .order("work_date", { ascending: true })
    .limit(1);
  return (data?.[0]?.work_date as string | undefined) ?? null;
}

export async function getLastClosedPeriodEnd(employeeId: string): Promise<string | null> {
  const supabase = db(await createSessionClient());
  const { data } = await supabase
    .from("hr_payments")
    .select("period_end")
    .eq("employee_id", employeeId)
    .neq("status", "canceled")
    .order("period_end", { ascending: false })
    .limit(1);
  return (data?.[0]?.period_end as string | undefined) ?? null;
}

export async function listAdjustments(
  employeeId: string,
  options: { limit?: number } = {}
): Promise<HrAdjustment[]> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase
    .from("hr_adjustments")
    .select("id, employee_id, kind, amount, occurred_on, description, payment_id, created_at")
    .eq("employee_id", employeeId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);
  return error ? [] : ((data ?? []) as any[]).map((row) => ({ ...row, amount: num(row.amount) }) as HrAdjustment);
}

/** Prévia do fechamento calculada pelo banco (a mesma conta que grava o pagamento). */
export async function getPeriodPreview(employeeId: string, start: string, end: string): Promise<HrPeriodPreview | null> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase.rpc("hr_period_preview", { p_employee_id: employeeId, p_start: start, p_end: end });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return {
    days_worked: num(row.days_worked),
    gross: num(row.gross),
    bonus: num(row.bonus),
    deductions: num(row.deductions),
    advances: num(row.advances),
    net: num(row.net),
    has_overlap: Boolean(row.has_overlap),
  };
}

export interface HrDashboard {
  today: string;
  activeCount: number;
  pendingTotal: number;
  pendingPayments: HrPaymentWithEmployee[];
  paidThisMonth: number;
  upcoming: { employee: HrEmployee; payday: string }[];
  birthdays: HrEmployee[];
}

export async function getHrDashboard(companyId: string): Promise<HrDashboard> {
  const today = todayDateSaoPaulo();
  const monthStart = `${today.slice(0, 8)}01`;
  const [employees, pending, paid] = await Promise.all([
    listEmployees(companyId, { status: "active" }),
    listPayments(companyId, { status: "pending", limit: 100 }),
    (async () => {
      const supabase = db(await createSessionClient());
      const { data } = await supabase
        .from("hr_payments")
        .select("net_amount")
        .eq("company_id", companyId)
        .eq("status", "paid")
        .gte("paid_on", monthStart);
      return ((data ?? []) as { net_amount: unknown }[]).reduce((sum, row) => sum + num(row.net_amount), 0);
    })(),
  ]);

  const horizon = addDays(today, 7);
  const upcoming = employees
    .map((employee) => ({ employee, payday: nextPayday(employee, today) }))
    .filter((item) => item.payday <= horizon)
    .sort((a, b) => a.payday.localeCompare(b.payday) || a.employee.full_name.localeCompare(b.employee.full_name));

  return {
    today,
    activeCount: employees.length,
    pendingTotal: pending.reduce((sum, payment) => sum + payment.net_amount, 0),
    pendingPayments: pending.sort((a, b) => a.due_on.localeCompare(b.due_on)),
    paidThisMonth: paid,
    upcoming,
    birthdays: employees.filter((employee) => hasBirthdayInMonth(employee.birth_date, today)),
  };
}


export async function getEmployeeClt(employeeId: string): Promise<HrEmployeeClt | null> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase
    .from("hr_employee_clt")
    .select("employee_id, weekly_hours, contract_type, experience_days, contract_end_on, dependents, vt_enabled, vt_monthly_cost")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    ...data,
    weekly_hours: num(data.weekly_hours),
    dependents: num(data.dependents),
    experience_days: data.experience_days === null ? null : num(data.experience_days),
    vt_monthly_cost: data.vt_monthly_cost === null ? null : num(data.vt_monthly_cost),
  } as HrEmployeeClt;
}

/** Regime do empregador; sem configuração salva vale o Simples Nacional (sem INSS patronal separado). */
export async function getHrSettings(companyId: string): Promise<HrSettings> {
  const supabase = db(await createSessionClient());
  const { data } = await supabase.from("hr_settings").select("employer_regime, employer_inss_rate").eq("company_id", companyId).maybeSingle();
  if (!data) return { employer_regime: "simples", employer_inss_rate: 0 };
  return { employer_regime: data.employer_regime, employer_inss_rate: num(data.employer_inss_rate) };
}

export interface HrTaxTablesLoaded {
  tables: PayrollTables;
  /** Vigência (valid_from) de cada tabela usada, para o retrato da folha. */
  versions: { inss: string; irrf: string; params: string };
}

/** Tabelas de impostos vigentes no mês (maior valid_from <= primeiro dia do mês). null se faltar alguma. */
export async function getPayrollTables(monthStart: string): Promise<HrTaxTablesLoaded | null> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase
    .from("hr_tax_tables")
    .select("kind, valid_from, data")
    .lte("valid_from", monthStart)
    .order("valid_from", { ascending: false });
  if (error || !data) return null;
  const pick = (kind: string) => (data as any[]).find((row) => row.kind === kind);
  const inss = pick("inss");
  const irrf = pick("irrf");
  const params = pick("params");
  if (!inss || !irrf || !params) return null;
  const numberize = (value: any): any => (Array.isArray(value) ? value.map(numberize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, numberize(v)])) : typeof value === "string" && value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value);
  return {
    tables: { inss: numberize(inss.data), irrf: numberize(irrf.data), params: numberize(params.data) },
    versions: { inss: inss.valid_from, irrf: irrf.valid_from, params: params.valid_from },
  };
}

/** Vales, descontos e bônus ainda não acertados até o fim do mês (entram na folha). */
export async function listOpenAdjustmentsUntil(employeeId: string, monthEnd: string): Promise<HrAdjustment[]> {
  const supabase = db(await createSessionClient());
  const { data, error } = await supabase
    .from("hr_adjustments")
    .select("id, employee_id, kind, amount, occurred_on, description, payment_id, created_at")
    .eq("employee_id", employeeId)
    .is("payment_id", null)
    .lte("occurred_on", monthEnd);
  return error ? [] : ((data ?? []) as any[]).map((row) => ({ ...row, amount: num(row.amount) }) as HrAdjustment);
}

/** Existe pagamento não cancelado que cubra parte do mês? */
export async function hasPaymentInMonth(employeeId: string, monthStart: string, monthEnd: string): Promise<boolean> {
  const supabase = db(await createSessionClient());
  const { data } = await supabase
    .from("hr_payments")
    .select("id")
    .eq("employee_id", employeeId)
    .neq("status", "canceled")
    .lte("period_start", monthEnd)
    .gte("period_end", monthStart)
    .limit(1);
  return Boolean(data && data.length > 0);
}
