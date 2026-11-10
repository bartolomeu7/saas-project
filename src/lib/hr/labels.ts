/** Rótulos do RH em português (sem dependências: usados no servidor e no navegador). */
import type { HrAdjustmentKind, HrPaymentStatus, HrPayMethod } from "../../types/hr";

export const ADJUSTMENT_LABELS: Record<HrAdjustmentKind, string> = {
  advance: "Vale (adiantamento)",
  deduction: "Desconto",
  bonus: "Bônus / gorjeta",
};

export const PAYMENT_STATUS_LABELS: Record<HrPaymentStatus, string> = {
  pending: "A pagar",
  paid: "Pago",
  canceled: "Cancelado",
};

export const PAY_METHOD_LABELS: Record<HrPayMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  other: "Outro",
};

export const RATE_KIND_LABELS = {
  per_day: "Por diária (valor × dias trabalhados)",
  fixed: "Valor fixo por período",
} as const;

/** "02/11 a 08/11/2026" */
export function formatPeriod(start: string, end: string): string {
  const [sy = "", sm = "", sd = ""] = start.split("-");
  const [ey = "", em = "", ed = ""] = end.split("-");
  if (start === end) return `${ed}/${em}/${ey}`;
  return sy === ey ? `${sd}/${sm} a ${ed}/${em}/${ey}` : `${sd}/${sm}/${sy} a ${ed}/${em}/${ey}`;
}

export const CONTRACT_TYPE_LABELS = {
  indefinite: "Prazo indeterminado",
  experience: "Contrato de experiência",
  fixed_term: "Prazo determinado",
} as const;

export const REGIME_LABELS = {
  simples: "Simples Nacional (sem INSS patronal separado: vai dentro do DAS)",
  mei: "MEI (3% de INSS sobre o salário)",
  other: "Outro regime (informe o percentual de INSS patronal)",
} as const;

export const PAYMENT_KIND_LABELS = {
  period: "Período",
  payroll: "Folha do mês",
  vacation: "Férias",
  thirteenth: "13º salário",
} as const;

/** Título curto de um pagamento para listas: "Folha 11/2026", "Férias 10/03 a 23/03/2025", "13º — 1ª parcela (2026)". */
export function paymentTitle(payment: {
  kind: "period" | "payroll" | "vacation" | "thirteenth";
  period_start: string;
  period_end: string;
  reference_month: string | null;
  calc: Record<string, any> | null;
}): string {
  if (payment.kind === "payroll" && payment.reference_month) {
    const [year = "", month = ""] = payment.reference_month.split("-");
    return `Folha ${month}/${year}`;
  }
  if (payment.kind === "vacation") return `Férias ${formatPeriod(payment.period_start, payment.period_end)}`;
  if (payment.kind === "thirteenth") return `13º salário — ${payment.calc?.installment ?? "?"}ª parcela (${payment.calc?.year ?? ""})`;
  return formatPeriod(payment.period_start, payment.period_end);
}
