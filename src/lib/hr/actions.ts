"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/matrix";
import { parseMoneyInput } from "@/lib/parse-money";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { addDays, diffDays } from "@/lib/hr/schedule";
import { getEmployee, getEmployeeClt, getHrSettings, getPayrollTables, listVacations } from "@/lib/hr/queries";
import { calcThirteenth, calcVacationPay, thirteenthAvos } from "@/lib/hr/payroll";
import { buildPayroll, MONTH_PATTERN } from "@/lib/hr/payroll-service";
import type { ActionResult } from "@/lib/auth/actions";
import type { HrAdjustmentKind, HrContractType, HrEmployerRegime, HrPayFrequency, HrPayMethod, HrRateKind } from "@/types/hr";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES: HrPayFrequency[] = ["daily", "weekly", "biweekly", "monthly"];
const RATE_KINDS: HrRateKind[] = ["per_day", "fixed"];
const ADJUSTMENT_KINDS: HrAdjustmentKind[] = ["advance", "deduction", "bonus"];
const PAY_METHODS: HrPayMethod[] = ["cash", "pix", "other"];
const CONTRACT_TYPES: HrContractType[] = ["indefinite", "experience", "fixed_term"];
const REGIMES: HrEmployerRegime[] = ["simples", "mei", "other"];

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();

/**
 * Mensagem para a pessoa. As funções do RH recusam com texto em português escrito para leigo (code P0001);
 * qualquer outro erro é técnico (tabela ausente, violação de restrição, falha de conexão) e vira um aviso
 * genérico — jargão de banco de dados nunca aparece na tela.
 */
function friendly(error: { message?: string; code?: string } | null, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === undefined && error.message && !/\b(relation|function|column|syntax|permission denied|does not exist)\b/i.test(error.message)) {
    return error.message;
  }
  console.error("[rh] erro técnico", error);
  return fallback;
}
const isDate = (value: string) => DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

// O banco é a barreira real (RLS e funções recusam quem não é dono/administrador); isto só devolve uma mensagem clara.
async function manager() {
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." } as const;
  if (!can(current.role, "hr.manage")) return { error: "Só o dono e os administradores podem usar o RH." } as const;
  return { companyId: current.company.id } as const;
}

function revalidateHr(employeeId?: string) {
  revalidatePath("/app/rh");
  revalidatePath("/app/rh/pagamentos");
  if (employeeId) revalidatePath(`/app/rh/${employeeId}`);
}

function revalidateMoney() {
  revalidatePath("/app/caixa");
  revalidatePath("/app/financeiro");
  revalidatePath("/app/relatorios");
  revalidatePath("/app");
}

interface ParsedCommon {
  full_name: string;
  birth_date: string | null;
  phone: string | null;
  role_title: string | null;
  pix_key: string | null;
  started_on: string | null;
  notes: string | null;
}

interface ParsedInformal extends ParsedCommon {
  rate_kind: HrRateKind;
  base_amount: number;
  pay_frequency: HrPayFrequency;
  pay_weekday: number | null;
  pay_day_of_month: number | null;
}

function parseCommon(formData: FormData): ParsedCommon | { error: string } {
  const full_name = text(formData.get("full_name"));
  if (full_name.length < 3) return { error: "Informe o nome completo do funcionário." };
  if (full_name.length > 160) return { error: "O nome é longo demais (máximo 160 letras)." };

  const birth = text(formData.get("birth_date"));
  if (birth) {
    if (!isDate(birth) || birth < "1900-01-01") return { error: "Data de nascimento inválida." };
    if (birth > todayDateSaoPaulo()) return { error: "A data de nascimento não pode ser no futuro." };
  }
  const started = text(formData.get("started_on"));
  if (started && !isDate(started)) return { error: "Data de início inválida." };

  const phone = text(formData.get("phone"));
  const roleTitle = text(formData.get("role_title"));
  const pix = text(formData.get("pix_key"));
  const notes = text(formData.get("notes"));
  if (phone.length > 40) return { error: "Telefone longo demais." };
  if (phone && phone.replace(/\D/g, "").length < 8) return { error: "Telefone inválido. Informe o número com DDD." };
  if (phone && /[A-Za-zÀ-ÿ]/.test(phone)) return { error: "Telefone inválido. Use só números, parênteses, espaço e hífen." };
  if (roleTitle.length > 80) return { error: "Função longa demais (máximo 80)." };
  if (pix.length > 140) return { error: "Chave Pix longa demais." };
  if (notes.length > 2000) return { error: "Observações longas demais (máximo 2000)." };

  return { full_name, birth_date: birth || null, phone: phone || null, role_title: roleTitle || null, pix_key: pix || null, started_on: started || null, notes: notes || null };
}

function parseEmployee(formData: FormData): ParsedInformal | { error: string } {
  const common = parseCommon(formData);
  if ("error" in common) return common;

  const rateKind = text(formData.get("rate_kind")) as HrRateKind;
  if (!RATE_KINDS.includes(rateKind)) return { error: "Escolha se o pagamento é por diária ou valor fixo." };
  const amount = parseMoneyInput(text(formData.get("base_amount")));
  if (amount === null || amount <= 0) return { error: "Informe o valor (maior que zero)." };
  if (amount >= 10_000_000) return { error: "Valor alto demais." };

  const frequency = text(formData.get("pay_frequency")) as HrPayFrequency;
  if (!FREQUENCIES.includes(frequency)) return { error: "Escolha a frequência de pagamento." };

  let weekday: number | null = null;
  let monthDay: number | null = null;
  if (frequency === "weekly") {
    weekday = Number(text(formData.get("pay_weekday")));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "Escolha o dia da semana do pagamento." };
  } else if (frequency === "monthly" || frequency === "biweekly") {
    monthDay = Number(text(formData.get("pay_day_of_month")));
    const max = frequency === "biweekly" ? 15 : 31;
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > max) {
      return { error: frequency === "biweekly" ? "No pagamento quinzenal, informe um dia de 1 a 15 (paga nesse dia e 15 dias depois)." : "Informe o dia do mês do pagamento (1 a 31)." };
    }
  }

  return { ...common, rate_kind: rateKind, base_amount: amount, pay_frequency: frequency, pay_weekday: weekday, pay_day_of_month: monthDay };
}

interface ParsedClt extends ParsedCommon {
  salary: number;
  pay_day: number;
  weekly_hours: number;
  contract_type: HrContractType;
  experience_days: number | null;
  contract_end_on: string | null;
  dependents: number;
  vt_enabled: boolean;
  vt_monthly_cost: number | null;
}

function parseClt(formData: FormData): ParsedClt | { error: string } {
  const common = parseCommon(formData);
  if ("error" in common) return common;

  const salary = parseMoneyInput(text(formData.get("base_amount")));
  if (salary === null || salary <= 0) return { error: "Informe o salário (maior que zero)." };
  if (salary >= 10_000_000) return { error: "Salário alto demais." };
  const payDay = Number(text(formData.get("pay_day_of_month")));
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) return { error: "Informe o dia do mês do pagamento (1 a 31)." };

  const hours = Number(text(formData.get("clt_weekly_hours")).replace(",", "."));
  if (!Number.isFinite(hours) || hours < 1 || hours > 44) return { error: "A jornada semanal deve ficar entre 1 e 44 horas." };

  const contractType = text(formData.get("clt_contract_type")) as HrContractType;
  if (!CONTRACT_TYPES.includes(contractType)) return { error: "Escolha o tipo de contrato." };
  let experienceDays: number | null = null;
  if (contractType === "experience") {
    experienceDays = Number(text(formData.get("clt_experience_days")));
    if (!Number.isInteger(experienceDays) || experienceDays < 1 || experienceDays > 90) return { error: "Contrato de experiência: informe de 1 a 90 dias." };
  }
  const contractEnd = text(formData.get("clt_contract_end_on"));
  if (contractEnd && !isDate(contractEnd)) return { error: "Data de fim do contrato inválida." };

  const dependents = Number(text(formData.get("clt_dependents")) || "0");
  if (!Number.isInteger(dependents) || dependents < 0 || dependents > 20) return { error: "Número de dependentes inválido (0 a 20)." };

  const vtEnabled = text(formData.get("clt_vt_enabled")) === "on";
  const vtCostText = text(formData.get("clt_vt_monthly_cost"));
  let vtCost: number | null = null;
  if (vtEnabled && vtCostText) {
    vtCost = parseMoneyInput(vtCostText);
    if (vtCost === null || vtCost >= 100_000) return { error: "Custo do vale-transporte inválido." };
  }

  return { ...common, salary, pay_day: payDay, weekly_hours: hours, contract_type: contractType, experience_days: experienceDays, contract_end_on: contractEnd || null, dependents, vt_enabled: vtEnabled, vt_monthly_cost: vtCost };
}

function saveCltRpcArgs(employeeId: string | null, parsed: ParsedClt) {
  return {
    p_employee_id: employeeId,
    p_full_name: parsed.full_name,
    p_birth_date: parsed.birth_date,
    p_phone: parsed.phone,
    p_role_title: parsed.role_title,
    p_pix_key: parsed.pix_key,
    p_salary: parsed.salary,
    p_pay_day: parsed.pay_day,
    p_started_on: parsed.started_on,
    p_notes: parsed.notes,
    p_weekly_hours: parsed.weekly_hours,
    p_contract_type: parsed.contract_type,
    p_experience_days: parsed.experience_days,
    p_contract_end_on: parsed.contract_end_on,
    p_dependents: parsed.dependents,
    p_vt_enabled: parsed.vt_enabled,
    p_vt_monthly_cost: parsed.vt_monthly_cost,
  };
}

export async function createEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const mode = text(formData.get("mode")) === "clt" ? "clt" : "informal";
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;

  if (mode === "clt") {
    const parsed = parseClt(formData);
    if ("error" in parsed) return parsed;
    const { data, error } = await supabase.rpc("hr_save_clt_employee", saveCltRpcArgs(null, parsed));
    const id = (Array.isArray(data) ? data[0] : data)?.id as string | undefined;
    if (error || !id) return { error: friendly(error, "Não foi possível salvar o funcionário.") };
    revalidateHr();
    redirect(`/app/rh/${id}`);
  }

  const parsed = parseEmployee(formData);
  if ("error" in parsed) return parsed;
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("hr_employees")
    .insert({ company_id: guard.companyId, created_by: user?.id ?? null, mode: "informal", ...parsed })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível salvar o funcionário." };
  revalidateHr();
  redirect(`/app/rh/${data.id}`);
}

export async function updateEmployeeAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;

  // O modo vem do cadastro (não do formulário): CLT e informal têm regras diferentes e não se trocam depois.
  const { data: current } = await supabase.from("hr_employees").select("mode").eq("id", id).eq("company_id", guard.companyId).maybeSingle();
  if (!current) return { error: "Funcionário não encontrado." };

  if (current.mode === "clt") {
    const parsed = parseClt(formData);
    if ("error" in parsed) return parsed;
    const { error } = await supabase.rpc("hr_save_clt_employee", saveCltRpcArgs(id, parsed));
    if (error) return { error: friendly(error, "Não foi possível salvar as alterações.") };
    revalidateHr(id);
    redirect(`/app/rh/${id}`);
  }

  const parsed = parseEmployee(formData);
  if ("error" in parsed) return parsed;
  const { error } = await supabase.from("hr_employees").update(parsed).eq("id", id).eq("company_id", guard.companyId);
  if (error) return { error: "Não foi possível salvar as alterações." };
  revalidateHr(id);
  redirect(`/app/rh/${id}`);
}

export async function setEmployeeStatusAction(id: string, status: "active" | "inactive"): Promise<void> {
  const guard = await manager();
  if ("error" in guard) return;
  const supabase = (await createSessionClient()) as any;
  // A data de saída nunca pode ser anterior ao início (regra do banco): quem tem admissão futura sai na própria data de início.
  const { data: current } = await supabase.from("hr_employees").select("started_on").eq("id", id).eq("company_id", guard.companyId).maybeSingle();
  const today = todayDateSaoPaulo();
  const startedOn = (current as { started_on?: string | null } | null)?.started_on ?? null;
  const endedOn = status === "inactive" ? (startedOn && startedOn > today ? startedOn : today) : null;
  const { error } = await supabase
    .from("hr_employees")
    .update({ status, ended_on: endedOn })
    .eq("id", id)
    .eq("company_id", guard.companyId);
  revalidateHr(id);
  if (error) {
    console.error("[rh] não foi possível alterar o status", error);
    redirect(`/app/rh/${id}?erro=status`);
  }
  redirect(`/app/rh/${id}`);
}

/**
 * Marca (ou apaga) a presença. Três jeitos de informar os dias:
 *  - `pick` = "AAAA-MM-DD|quantidade" (botão de um dia na lista);
 *  - `from` e `to` (intervalo, até 62 dias) + `quantity`;
 *  - `dates` (lista separada por vírgula) + `quantity`.
 * `quantity`: 1 (dia inteiro), 0.5 (meio dia), 0 (falta) ou "clear" (apagar a marcação).
 */
export async function setAttendanceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const employeeId = text(formData.get("employeeId"));
  if (!employeeId) return { error: "Funcionário inválido." };

  let dates: string[] = [];
  let choice = text(formData.get("quantity"));
  const pick = text(formData.get("pick"));
  const from = text(formData.get("from"));
  const to = text(formData.get("to"));
  if (pick) {
    const [day = "", picked = ""] = pick.split("|");
    dates = [day];
    choice = picked;
  } else if (from || to) {
    if (!isDate(from) || !isDate(to)) return { error: "Informe o primeiro e o último dia." };
    if (to < from) return { error: "O último dia não pode ser antes do primeiro." };
    const span = diffDays(from, to);
    if (span > 61) return { error: "Marque no máximo 62 dias por vez." };
    dates = Array.from({ length: span + 1 }, (_, index) => addDays(from, index));
  } else {
    dates = text(formData.get("dates")).split(",").map((d) => d.trim()).filter(Boolean);
  }
  if (dates.length === 0 || dates.some((d) => !isDate(d))) return { error: "Escolha pelo menos um dia válido." };
  const quantity = choice === "clear" ? null : Number(choice);
  if (quantity !== null && (choice === "" || ![0, 0.5, 1].includes(quantity))) return { error: "Escolha: dia inteiro, meio dia ou falta." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const supabase = (await createSessionClient()) as any;
  if (quantity !== null) {
    const { data: emp } = await supabase.from("hr_employees").select("started_on").eq("id", employeeId).eq("company_id", guard.companyId).maybeSingle();
    const startedOn = (emp as { started_on?: string | null } | null)?.started_on;
    if (startedOn && dates.some((d) => d < startedOn)) {
      return { error: `Esse funcionário começou em ${startedOn.split("-").reverse().join("/")}. Não dá para marcar presença antes disso.` };
    }
  }
  const { error } = await supabase.rpc("hr_set_attendance", { p_employee_id: employeeId, p_work_dates: dates, p_quantity: quantity });
  if (error) return { error: friendly(error, "Não foi possível marcar a presença.") };
  revalidateHr(employeeId);
  return { success: quantity === null ? "Marcação apagada." : "Presença registrada." };
}

export async function addAdjustmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const employeeId = text(formData.get("employeeId"));
  const kind = text(formData.get("kind")) as HrAdjustmentKind;
  const amount = parseMoneyInput(text(formData.get("amount")));
  const occurredOn = text(formData.get("occurred_on"));
  const description = text(formData.get("description"));
  const method = text(formData.get("method")) as HrPayMethod | "";

  if (!employeeId) return { error: "Funcionário inválido." };
  if (!ADJUSTMENT_KINDS.includes(kind)) return { error: "Escolha: vale, desconto ou bônus." };
  if (amount === null || amount <= 0) return { error: "Informe um valor maior que zero." };
  if (occurredOn && !isDate(occurredOn)) return { error: "Data inválida." };
  if (kind === "advance" && !PAY_METHODS.includes(method as HrPayMethod)) return { error: "Informe como o vale foi pago (dinheiro, Pix ou outro)." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase.rpc("hr_add_adjustment", {
    p_employee_id: employeeId,
    p_kind: kind,
    p_amount: amount,
    p_occurred_on: occurredOn || null,
    p_description: description || null,
    p_method: kind === "advance" ? method : null,
  });
  if (error) return { error: friendly(error, "Não foi possível registrar.") };
  revalidateHr(employeeId);
  if (kind === "advance") revalidateMoney();
  return {
    success:
      kind === "advance"
        ? "Vale registrado e lançado no Financeiro."
        : kind === "deduction"
          ? "Desconto registrado. Ele entra no próximo fechamento."
          : "Bônus registrado. Ele entra no próximo fechamento.",
  };
}

export async function deleteAdjustmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const adjustmentId = text(formData.get("adjustmentId"));
  const employeeId = text(formData.get("employeeId"));
  if (!adjustmentId) return { error: "Lançamento inválido." };
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase.rpc("hr_delete_adjustment", { p_adjustment_id: adjustmentId });
  if (error) return { error: friendly(error, "Não foi possível apagar.") };
  revalidateHr(employeeId || undefined);
  return { success: "Lançamento apagado." };
}

export async function closePeriodAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const employeeId = text(formData.get("employeeId"));
  const start = text(formData.get("period_start"));
  const end = text(formData.get("period_end"));
  const dueOn = text(formData.get("due_on"));
  const notes = text(formData.get("notes"));
  if (!employeeId) return { error: "Funcionário inválido." };
  if (!isDate(start) || !isDate(end)) return { error: "Informe o início e o fim do período." };
  if (end < start) return { error: "O fim do período não pode ser antes do início." };
  if (dueOn && !isDate(dueOn)) return { error: "Data de pagamento inválida." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const supabase = (await createSessionClient()) as any;
  const { data, error } = await supabase.rpc("hr_close_period", {
    p_employee_id: employeeId,
    p_period_start: start,
    p_period_end: end,
    p_due_on: dueOn || null,
    p_notes: notes || null,
  });
  if (error) return { error: friendly(error, "Não foi possível fechar o período.") };
  revalidateHr(employeeId);
  const paymentId = (Array.isArray(data) ? data[0] : data)?.id as string | undefined;
  redirect(paymentId ? `/app/rh/pagamentos/${paymentId}` : `/app/rh/${employeeId}?aba=pagamentos`);
}

export async function payPaymentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const paymentId = text(formData.get("paymentId"));
  const method = text(formData.get("method")) as HrPayMethod;
  const paidOn = text(formData.get("paid_on"));
  if (!paymentId) return { error: "Pagamento inválido." };
  if (!PAY_METHODS.includes(method)) return { error: "Informe como foi pago (dinheiro, Pix ou outro)." };
  if (paidOn && !isDate(paidOn)) return { error: "Data de pagamento inválida." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const supabase = (await createSessionClient()) as any;
  const { data, error } = await supabase.rpc("hr_pay_payment", { p_payment_id: paymentId, p_method: method, p_paid_on: paidOn || null });
  if (error) return { error: friendly(error, "Não foi possível registrar o pagamento.") };
  const employeeId = (Array.isArray(data) ? data[0] : data)?.employee_id as string | undefined;
  revalidateHr(employeeId);
  revalidatePath(`/app/rh/pagamentos/${paymentId}`);
  revalidateMoney();
  return { success: "Pagamento registrado e lançado no Financeiro." };
}

export async function cancelPaymentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const paymentId = text(formData.get("paymentId"));
  if (!paymentId) return { error: "Pagamento inválido." };
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;
  const { data, error } = await supabase.rpc("hr_cancel_payment", { p_payment_id: paymentId });
  if (error) return { error: friendly(error, "Não foi possível cancelar.") };
  const employeeId = (Array.isArray(data) ? data[0] : data)?.employee_id as string | undefined;
  revalidateHr(employeeId);
  revalidatePath(`/app/rh/pagamentos/${paymentId}`);
  return { success: "Pagamento cancelado. Os dias e lançamentos ficaram livres para um novo fechamento." };
}

export async function saveHrSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const regime = text(formData.get("employer_regime")) as HrEmployerRegime;
  if (!REGIMES.includes(regime)) return { error: "Escolha o regime da empresa." };
  let rate = 0;
  if (regime === "other") {
    const percent = parseMoneyInput(text(formData.get("employer_inss_percent")));
    if (percent === null || percent > 50) return { error: "Informe o percentual de INSS patronal (de 0% a 50%)." };
    rate = percent / 100;
  }
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase.rpc("hr_save_settings", { p_regime: regime, p_inss_rate: regime === "other" ? rate : null });
  if (error) return { error: friendly(error, "Não foi possível salvar.") };
  revalidatePath("/app/rh/configuracoes");
  revalidateHr();
  return { success: "Configurações salvas." };
}

/** Fecha a folha do mês de um funcionário CLT: o app calcula INSS/IRRF/VT com as tabelas; o banco confere e grava. */
export async function closePayrollAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const employeeId = text(formData.get("employeeId"));
  const month = text(formData.get("month"));
  const overtime50 = parseMoneyInput(text(formData.get("overtime50")) || "0");
  const overtime100 = parseMoneyInput(text(formData.get("overtime100")) || "0");
  const absences = parseMoneyInput(text(formData.get("absences")) || "0");
  const vacationDays = parseMoneyInput(text(formData.get("vacation_days")) || "0");
  const dueOn = text(formData.get("due_on"));
  const notes = text(formData.get("notes"));
  if (!employeeId) return { error: "Funcionário inválido." };
  if (!MONTH_PATTERN.test(month)) return { error: "Mês inválido." };
  if (overtime50 === null || overtime100 === null || absences === null || vacationDays === null) return { error: "Horas extras, faltas e dias de férias devem ser números." };
  if (absences + vacationDays > 31) return { error: "Faltas mais dias de férias não podem passar de 31 dias." };
  if (dueOn && !isDate(dueOn)) return { error: "Data de pagamento inválida." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const employee = await getEmployee(guard.companyId, employeeId);
  if (!employee || employee.mode !== "clt") return { error: "Funcionário CLT não encontrado." };
  const [clt, settings] = await Promise.all([getEmployeeClt(employeeId), getHrSettings(guard.companyId)]);
  if (!clt) return { error: "Complete o cadastro CLT do funcionário (jornada e contrato)." };

  const built = await buildPayroll({ employee, clt, settings, month, overtime50, overtime100, absenceDays: absences, vacationDays });
  if (!built.ok) return { error: built.error };
  const { result, versions } = built;

  const supabase = (await createSessionClient()) as any;
  const { data, error } = await supabase.rpc("hr_close_payroll", {
    p_employee_id: employeeId,
    p_month: built.monthStart,
    p_overtime50_hours: overtime50,
    p_overtime100_hours: overtime100,
    p_absence_days: absences,
    p_vacation_days: vacationDays,
    p_inss: result.inss,
    p_irrf: result.irrf,
    p_vt: result.vt,
    p_due_on: dueOn || null,
    p_notes: notes || null,
    p_calc: {
      estimate: true,
      tables: versions,
      regime: settings.employer_regime,
      inputs: { overtime50, overtime100, absences, vacationDays, dependents: clt.dependents, weekly_hours: clt.weekly_hours },
      result,
    },
  });
  if (error) return { error: friendly(error, "Não foi possível fechar a folha.") };
  revalidateHr(employeeId);
  const paymentId = (Array.isArray(data) ? data[0] : data)?.id as string | undefined;
  redirect(paymentId ? `/app/rh/pagamentos/${paymentId}` : `/app/rh/${employeeId}?aba=pagamentos`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Férias e 13º (CLT)
// ---------------------------------------------------------------------------------------------------------------------

function revalidateVacations(employeeId: string) {
  revalidateHr(employeeId);
  revalidatePath("/app/rh");
}

export async function scheduleVacationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const employeeId = text(formData.get("employeeId"));
  const acquisitionStart = text(formData.get("acquisition_start"));
  const startOn = text(formData.get("start_on"));
  const days = Number(text(formData.get("days")));
  const absences = Number(text(formData.get("absences")) || "0");
  const notes = text(formData.get("notes"));
  if (!employeeId) return { error: "Funcionário inválido." };
  if (!isDate(acquisitionStart)) return { error: "Escolha o período aquisitivo." };
  if (!isDate(startOn)) return { error: "Informe o primeiro dia das férias." };
  if (!Number.isInteger(days) || days < 5 || days > 30) return { error: "Informe de 5 a 30 dias de férias." };
  if (!Number.isInteger(absences) || absences < 0 || absences > 365) return { error: "Faltas inválidas." };
  if (notes.length > 500) return { error: "Observação longa demais (máximo 500)." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase.rpc("hr_schedule_vacation", {
    p_employee_id: employeeId,
    p_acquisition_start: acquisitionStart,
    p_start_on: startOn,
    p_days: days,
    p_absences: absences,
    p_notes: notes || null,
  });
  if (error) return { error: friendly(error, "Não foi possível programar as férias.") };
  revalidateVacations(employeeId);
  return { success: "Férias programadas." };
}

export async function cancelVacationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const vacationId = text(formData.get("vacationId"));
  const employeeId = text(formData.get("employeeId"));
  if (!vacationId) return { error: "Férias inválidas." };
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase.rpc("hr_cancel_vacation", { p_vacation_id: vacationId });
  if (error) return { error: friendly(error, "Não foi possível cancelar.") };
  revalidateVacations(employeeId);
  return { success: "Férias canceladas." };
}

/** Gera o pagamento das férias: o app calcula INSS/IRRF com as tabelas; o banco confere e grava. */
export async function closeVacationPayAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const vacationId = text(formData.get("vacationId"));
  const employeeId = text(formData.get("employeeId"));
  if (!vacationId || !employeeId) return { error: "Férias inválidas." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const employee = await getEmployee(guard.companyId, employeeId);
  if (!employee || employee.mode !== "clt") return { error: "Funcionário CLT não encontrado." };
  const [clt, vacations] = await Promise.all([getEmployeeClt(employeeId), listVacations(employeeId)]);
  const vacation = vacations.find((row) => row.id === vacationId);
  if (!vacation) return { error: "Férias não encontradas." };
  if (!clt) return { error: "Complete o cadastro CLT do funcionário (jornada e contrato)." };

  const loaded = await getPayrollTables(`${vacation.start_on.slice(0, 7)}-01`);
  if (!loaded) return { error: "Não há tabela de INSS/IRRF cadastrada para este mês. Fale com o suporte." };
  const result = calcVacationPay({ salary: employee.base_amount, days: vacation.days, dependents: clt.dependents, tables: loaded.tables });

  const supabase = (await createSessionClient()) as any;
  const { data, error } = await supabase.rpc("hr_close_vacation_pay", {
    p_vacation_id: vacationId,
    p_inss: result.inss,
    p_irrf: result.irrf,
    p_due_on: null,
    p_notes: null,
    p_calc: { estimate: true, tables: loaded.versions, days: vacation.days, result },
  });
  if (error) return { error: friendly(error, "Não foi possível gerar o pagamento das férias.") };
  revalidateVacations(employeeId);
  const paymentId = (Array.isArray(data) ? data[0] : data)?.id as string | undefined;
  redirect(paymentId ? `/app/rh/pagamentos/${paymentId}` : `/app/rh/${employeeId}?aba=ferias`);
}

/** Gera uma parcela do 13º (1ª: metade sem descontos; 2ª: complemento com INSS e IRRF do total). */
export async function closeThirteenthAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const employeeId = text(formData.get("employeeId"));
  const year = Number(text(formData.get("year")));
  const installment = Number(text(formData.get("installment")));
  const firstElsewhere = text(formData.get("first_elsewhere")) === "on";
  if (!employeeId) return { error: "Funcionário inválido." };
  if (!Number.isInteger(year) || year < 2000 || year > Number(todayDateSaoPaulo().slice(0, 4))) return { error: "Ano inválido." };
  if (installment !== 1 && installment !== 2) return { error: "Parcela inválida." };
  const guard = await manager();
  if ("error" in guard) return guard;

  const employee = await getEmployee(guard.companyId, employeeId);
  if (!employee || employee.mode !== "clt") return { error: "Funcionário CLT não encontrado." };
  if (!employee.started_on) return { error: "Informe a data de admissão no cadastro do funcionário." };
  const clt = await getEmployeeClt(employeeId);
  if (!clt) return { error: "Complete o cadastro CLT do funcionário (jornada e contrato)." };

  const avos = thirteenthAvos(employee.started_on, year, employee.status === "inactive" ? employee.ended_on : null);
  if (avos < 1) return { error: "Sem avos de 13º neste ano para este funcionário." };
  const loaded = await getPayrollTables(`${year}-12-01`);
  if (!loaded) return { error: "Não há tabela de INSS/IRRF cadastrada para este ano. Fale com o suporte." };
  const result = calcThirteenth({ salary: employee.base_amount, avos, dependents: clt.dependents, tables: loaded.tables });

  const supabase = (await createSessionClient()) as any;
  const { data, error } = await supabase.rpc("hr_close_thirteenth", {
    p_employee_id: employeeId,
    p_year: year,
    p_installment: installment,
    p_avos: avos,
    p_inss: installment === 2 ? result.inss : 0,
    p_irrf: installment === 2 ? result.irrf : 0,
    p_due_on: null,
    p_first_paid_elsewhere: firstElsewhere,
    p_notes: null,
    p_calc: { estimate: true, tables: loaded.versions, result },
  });
  if (error) return { error: friendly(error, "Não foi possível gerar a parcela do 13º.") };
  revalidateVacations(employeeId);
  const paymentId = (Array.isArray(data) ? data[0] : data)?.id as string | undefined;
  redirect(paymentId ? `/app/rh/pagamentos/${paymentId}` : `/app/rh/${employeeId}?aba=ferias`);
}
