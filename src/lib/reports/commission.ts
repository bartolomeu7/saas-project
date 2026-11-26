/**
 * Comissão por profissional nos Relatórios. A conta é feita no banco (`report_commission`); aqui ficam a leitura da
 * resposta e a validação do que é digitado. Funções puras, com teste unitário.
 */
type Numeric = number | string;
const number = (value: unknown) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100) / 100;

export const MIN_RATE_DATE = "2000-01-01";

/** "10", "10,5" ou "10%" → número entre 0 e 100 com até 2 casas. */
export function parsePercentInput(value: string): { ok: true; percent: number } | { ok: false; error: string } {
  const text = value.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text) || Number(text) > 100) {
    return { ok: false, error: "Informe um percentual de 0 a 100, com até 2 casas." };
  }
  return { ok: true, percent: Number(text) };
}

/** Data de calendário AAAA-MM-DD, de 2000 em diante. */
export function isRateDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_RATE_DATE) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export interface CommissionReportRow {
  professionals: Array<{ id: string | null; name: string | null; services: Numeric; base: Numeric; commission: Numeric; pending_base: Numeric; pending_commission: Numeric }>;
  items: Array<{
    item_id: string;
    sale_id: string;
    date: string;
    description: string;
    base: Numeric;
    professional_id: string | null;
    professional: string | null;
    chosen: boolean;
    percent: Numeric;
    commission: Numeric;
  }>;
  items_total: Numeric;
  team: Array<{ id: string; name: string; active: boolean; percent: Numeric | null; valid_from: string | null }>;
}

export function buildCommissionReport(raw: CommissionReportRow) {
  const professionals = raw.professionals.map((row) => ({
    id: row.id,
    name: row.id ? (row.name ?? "Profissional removido") : "Sem profissional",
    services: number(row.services),
    base: number(row.base),
    commission: number(row.commission),
    pendingBase: number(row.pending_base),
    pendingCommission: number(row.pending_commission),
  }));
  const sum = (pick: (row: (typeof professionals)[number]) => number) => cents(professionals.reduce((total, row) => total + pick(row), 0));
  const unassigned = professionals.find((row) => row.id === null);
  const team = raw.team.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    percent: row.percent === null ? null : number(row.percent),
    validFrom: row.valid_from,
  }));
  return {
    professionals,
    commission: sum((row) => row.commission),
    base: sum((row) => row.base),
    pendingBase: sum((row) => row.pendingBase),
    pendingCommission: sum((row) => row.pendingCommission),
    unassigned: { services: unassigned?.services ?? 0, base: unassigned?.base ?? 0 },
    items: raw.items.map((row) => ({
      itemId: row.item_id,
      saleId: row.sale_id,
      date: row.date,
      description: row.description,
      base: number(row.base),
      professionalId: row.professional_id,
      professional: row.professional,
      /** Escolhido no relatório (e não vindo da agenda). */
      chosen: row.chosen,
      percent: number(row.percent),
      commission: number(row.commission),
    })),
    itemsTotal: number(raw.items_total),
    team,
    /** Ninguém com percentual: a comissão sai zerada e a tela precisa dizer por quê. */
    noRates: !team.some((member) => member.percent !== null && member.percent > 0),
  };
}

export type CommissionReport = ReturnType<typeof buildCommissionReport>;
