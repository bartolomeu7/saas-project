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
import type { ActionResult } from "@/lib/auth/actions";
import type { HrAdjustmentKind, HrPayFrequency, HrPayMethod, HrRateKind } from "@/types/hr";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES: HrPayFrequency[] = ["daily", "weekly", "biweekly", "monthly"];
const RATE_KINDS: HrRateKind[] = ["per_day", "fixed"];
const ADJUSTMENT_KINDS: HrAdjustmentKind[] = ["advance", "deduction", "bonus"];
const PAY_METHODS: HrPayMethod[] = ["cash", "pix", "other"];

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
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

interface ParsedEmployee {
  full_name: string;
  birth_date: string | null;
  phone: string | null;
  role_title: string | null;
  pix_key: string | null;
  rate_kind: HrRateKind;
  base_amount: number;
  pay_frequency: HrPayFrequency;
  pay_weekday: number | null;
  pay_day_of_month: number | null;
  started_on: string | null;
  notes: string | null;
}

function parseEmployee(formData: FormData): ParsedEmployee | { error: string } {
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

  const phone = text(formData.get("phone"));
  const roleTitle = text(formData.get("role_title"));
  const pix = text(formData.get("pix_key"));
  const notes = text(formData.get("notes"));
  if (phone.length > 40) return { error: "Telefone longo demais." };
  if (roleTitle.length > 80) return { error: "Função longa demais (máximo 80)." };
  if (pix.length > 140) return { error: "Chave Pix longa demais." };
  if (notes.length > 2000) return { error: "Observações longas demais (máximo 2000)." };

  return {
    full_name,
    birth_date: birth || null,
    phone: phone || null,
    role_title: roleTitle || null,
    pix_key: pix || null,
    rate_kind: rateKind,
    base_amount: amount,
    pay_frequency: frequency,
    pay_weekday: weekday,
    pay_day_of_month: monthDay,
    started_on: started || null,
    notes: notes || null,
  };
}

export async function createEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseEmployee(formData);
  if ("error" in parsed) return parsed;
  const guard = await manager();
  if ("error" in guard) return guard;
  const user = await getCurrentUser();
  const supabase = (await createSessionClient()) as any;
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
  const parsed = parseEmployee(formData);
  if ("error" in parsed) return parsed;
  const guard = await manager();
  if ("error" in guard) return guard;
  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase.from("hr_employees").update(parsed).eq("id", id).eq("company_id", guard.companyId);
  if (error) return { error: "Não foi possível salvar as alterações." };
  revalidateHr(id);
  redirect(`/app/rh/${id}`);
}

export async function setEmployeeStatusAction(id: string, status: "active" | "inactive"): Promise<void> {
  const guard = await manager();
  if ("error" in guard) return;
  const supabase = (await createSessionClient()) as any;
  const { error } = await supabase
    .from("hr_employees")
    .update({ status, ended_on: status === "inactive" ? todayDateSaoPaulo() : null })
    .eq("id", id)
    .eq("company_id", guard.companyId);
  if (!error) {
    }
  revalidateHr(id);
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
  const { error } = await supabase.rpc("hr_set_attendance", { p_employee_id: employeeId, p_work_dates: dates, p_quantity: quantity });
  if (error) return { error: error.message || "Não foi possível marcar a presença." };
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
  if (error) return { error: error.message || "Não foi possível registrar." };
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
  if (error) return { error: error.message || "Não foi possível apagar." };
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
  if (error) return { error: error.message || "Não foi possível fechar o período." };
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
  if (error) return { error: error.message || "Não foi possível registrar o pagamento." };
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
  if (error) return { error: error.message || "Não foi possível cancelar." };
  const employeeId = (Array.isArray(data) ? data[0] : data)?.employee_id as string | undefined;
  revalidateHr(employeeId);
  revalidatePath(`/app/rh/pagamentos/${paymentId}`);
  return { success: "Pagamento cancelado. Os dias e lançamentos ficaram livres para um novo fechamento." };
}
