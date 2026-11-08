export type HrPayFrequency = "daily" | "weekly" | "biweekly" | "monthly";
export type HrRateKind = "per_day" | "fixed";
export type HrEmployeeStatus = "active" | "inactive";
export type HrAdjustmentKind = "advance" | "deduction" | "bonus";
export type HrPaymentStatus = "pending" | "paid" | "canceled";
/** Formas aceitas para pagar funcionário (o banco recusa as demais). */
export type HrPayMethod = "cash" | "pix" | "other";

export interface HrEmployee {
  id: string;
  company_id: string;
  full_name: string;
  birth_date: string | null;
  phone: string | null;
  role_title: string | null;
  pix_key: string | null;
  mode: "informal" | "clt";
  status: HrEmployeeStatus;
  rate_kind: HrRateKind;
  base_amount: number;
  pay_frequency: HrPayFrequency;
  pay_weekday: number | null;
  pay_day_of_month: number | null;
  started_on: string | null;
  ended_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrEmployeeFormFields {
  full_name: string;
  birth_date: string;
  phone: string;
  role_title: string;
  pix_key: string;
  rate_kind: HrRateKind;
  base_amount: string;
  pay_frequency: HrPayFrequency;
  pay_weekday: string;
  pay_day_of_month: string;
  started_on: string;
  notes: string;
  clt_weekly_hours: string;
  clt_contract_type: string;
  clt_experience_days: string;
  clt_contract_end_on: string;
  clt_dependents: string;
  clt_vt_enabled: string;
  clt_vt_monthly_cost: string;
}

export type HrContractType = "indefinite" | "experience" | "fixed_term";
export type HrEmployerRegime = "simples" | "mei" | "other";

export interface HrEmployeeClt {
  employee_id: string;
  weekly_hours: number;
  contract_type: HrContractType;
  experience_days: number | null;
  contract_end_on: string | null;
  dependents: number;
  vt_enabled: boolean;
  vt_monthly_cost: number | null;
}

export interface HrSettings {
  employer_regime: HrEmployerRegime;
  /** Fração (0,208 = 20,8%). Só vale para employer_regime = "other". */
  employer_inss_rate: number;
}

export interface HrTimeEntry {
  id: string;
  employee_id: string;
  work_date: string;
  quantity: number;
  payment_id: string | null;
}

export interface HrAdjustment {
  id: string;
  employee_id: string;
  kind: HrAdjustmentKind;
  amount: number;
  occurred_on: string;
  description: string | null;
  payment_id: string | null;
  created_at: string;
}

export interface HrPayment {
  id: string;
  company_id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  days_worked: number;
  gross_amount: number;
  bonus_amount: number;
  deductions_amount: number;
  advances_amount: number;
  net_amount: number;
  due_on: string;
  status: HrPaymentStatus;
  paid_on: string | null;
  paid_method: HrPayMethod | null;
  notes: string | null;
  created_at: string;
  kind: "period" | "payroll";
  reference_month: string | null;
  /** Retrato da folha (kind = payroll): tabelas usadas, entradas, resultado do app e números do banco. */
  calc: Record<string, any> | null;
}

export interface HrPaymentWithEmployee extends HrPayment {
  employee: Pick<HrEmployee, "id" | "full_name"> | null;
}

export interface HrPeriodPreview {
  days_worked: number;
  gross: number;
  bonus: number;
  deductions: number;
  advances: number;
  net: number;
  has_overlap: boolean;
}
