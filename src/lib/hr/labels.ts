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
