import "server-only";

import { getPayrollTables, listOpenAdjustmentsUntil } from "@/lib/hr/queries";
import { estimatePayroll, type PayrollInput, type PayrollResult } from "@/lib/hr/payroll";
import { daysInMonth } from "@/lib/hr/schedule";
import type { HrEmployee, HrEmployeeClt, HrSettings } from "@/types/hr";

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface PayrollRequest {
  employee: HrEmployee;
  clt: HrEmployeeClt;
  settings: HrSettings;
  /** "AAAA-MM" */
  month: string;
  overtime50: number;
  overtime100: number;
  absenceDays: number;
  /** Dias de férias gozados no mês (o salário deles é pago no recibo de férias). */
  vacationDays?: number;
}

export type PayrollBuild =
  | {
      ok: true;
      result: PayrollResult;
      input: PayrollInput;
      versions: { inss: string; irrf: string; params: string };
      monthStart: string;
      monthEnd: string;
      openAdjustments: { bonus: number; deduction: number; advance: number };
    }
  | { ok: false; error: string };

/** Monta e calcula a folha estimada do mês. Usada pela tela (prévia) e pela ação de fechar (mesma conta). */
export async function buildPayroll(req: PayrollRequest): Promise<PayrollBuild> {
  if (!MONTH_PATTERN.test(req.month)) return { ok: false, error: "Mês inválido." };
  const [yearText = "1970", monthText = "01"] = req.month.split("-");
  const monthStart = `${req.month}-01`;
  const monthEnd = `${req.month}-${String(daysInMonth(Number(yearText), Number(monthText))).padStart(2, "0")}`;

  const loaded = await getPayrollTables(monthStart);
  if (!loaded) return { ok: false, error: "Não há tabela de INSS/IRRF cadastrada para este mês. Fale com o suporte." };

  const adjustments = await listOpenAdjustmentsUntil(req.employee.id, monthEnd);
  const sum = (kind: string) => adjustments.filter((row) => row.kind === kind).reduce((total, row) => total + row.amount, 0);
  const openAdjustments = { bonus: sum("bonus"), deduction: sum("deduction"), advance: sum("advance") };

  const input: PayrollInput = {
    salary: req.employee.base_amount,
    weeklyHours: req.clt.weekly_hours,
    dependents: req.clt.dependents,
    vtEnabled: req.clt.vt_enabled,
    vtMonthlyCost: req.clt.vt_monthly_cost,
    overtime50Hours: req.overtime50,
    overtime100Hours: req.overtime100,
    absenceDays: req.absenceDays,
    vacationDays: req.vacationDays ?? 0,
    bonus: openAdjustments.bonus,
    otherDeductions: openAdjustments.deduction,
    advances: openAdjustments.advance,
    employerRegime: req.settings.employer_regime,
    employerInssRate: req.settings.employer_inss_rate,
    tables: loaded.tables,
  };
  return { ok: true, result: estimatePayroll(input), input, versions: loaded.versions, monthStart, monthEnd, openAdjustments };
}
