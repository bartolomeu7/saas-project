/**
 * RH CLT — ESTIMATIVA da folha de pagamento mensal (INSS, IRRF, FGTS, vale-transporte).
 *
 * Função pura e SEM dependências (testável em Node). Os números das tabelas (faixas, alíquotas, deduções) NUNCA ficam
 * aqui: vêm da tabela `hr_tax_tables` do banco, versionada por vigência (conferida com gov.br/INSS e gov.br/Receita
 * Federal). É uma estimativa para controle interno — não substitui o holerite oficial nem o contador.
 *
 * Simplificações assumidas (documentadas na tela): sem DSR sobre horas extras e faltas, sem adicional noturno,
 * insalubridade ou periculosidade; bônus entra como remuneração tributável; "rendimento" para a redução do IRRF
 * (Lei 15.270/2025) é o total tributável do mês antes das deduções.
 */

export interface InssBracket {
  upto: number;
  rate: number;
}
export interface InssTable {
  brackets: InssBracket[];
}
export interface IrrfBracket {
  /** null = sem teto (última faixa). */
  upto: number | null;
  rate: number;
  deduction: number;
}
export interface IrrfTable {
  brackets: IrrfBracket[];
  dependent_deduction: number;
  simplified_discount: number;
  reduction: { zero_until: number; max: number; a: number; b: number; until: number };
}
export interface PayrollParams {
  minimum_wage: number;
  fgts_rate: number;
  vt_employee_rate: number;
}
export interface PayrollTables {
  inss: InssTable;
  irrf: IrrfTable;
  params: PayrollParams;
}

export type EmployerRegime = "simples" | "mei" | "other";

export interface PayrollInput {
  salary: number;
  weeklyHours: number;
  dependents: number;
  vtEnabled: boolean;
  /** Custo mensal do vale-transporte; limita o desconto do funcionário (6% do salário ou o custo, o menor). */
  vtMonthlyCost: number | null;
  overtime50Hours: number;
  overtime100Hours: number;
  absenceDays: number;
  /** Dias de férias gozados no mês: o salário desses dias é pago no recibo de férias, então sai da folha. */
  vacationDays?: number;
  /** Bônus/gratificação do mês (entra na base de INSS, FGTS e IRRF). */
  bonus: number;
  /** Outros descontos do mês (não legais), tirados depois dos impostos. */
  otherDeductions: number;
  /** Vales/adiantamentos já pagos no mês. */
  advances: number;
  employerRegime: EmployerRegime;
  /** Só para employerRegime = "other": percentual de INSS patronal (ex.: 0.2 = 20%). */
  employerInssRate: number;
  tables: PayrollTables;
}

export interface PayrollResult {
  hourlyRate: number;
  salary: number;
  overtime50: number;
  overtime100: number;
  absences: number;
  /** Salário dos dias de férias do mês (pago à parte, no recibo de férias). */
  vacation: number;
  bonus: number;
  /** Total bruto = base de INSS/FGTS/IRRF. */
  gross: number;
  inss: number;
  irrf: number;
  irrfDetail: IrrfDetail;
  vt: number;
  otherDeductions: number;
  advances: number;
  /** Descontos que saem do funcionário (INSS + IRRF + VT + outros), sem os vales. */
  deductionsTotal: number;
  net: number;
  employer: { fgts: number; inss: number; inssNote: string; totalCost: number };
}

export interface IrrfDetail {
  incomeForReduction: number;
  base: number;
  usedSimplified: boolean;
  tableTax: number;
  reduction: number;
}

/** Arredonda para centavos (meio para cima). O 1e-7 corrige erros de ponto flutuante como 121,57499999 -> 121,58. */
export const round2 = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
};

/** INSS do empregado: alíquotas progressivas por faixa, com teto no limite da última faixa. */
export function calcInss(base: number, table: InssTable): number {
  let previous = 0;
  let total = 0;
  for (const bracket of table.brackets) {
    if (base <= previous) break;
    const slice = Math.min(base, bracket.upto) - previous;
    if (slice > 0) total += slice * bracket.rate;
    previous = bracket.upto;
  }
  return round2(total);
}

/**
 * IRRF mensal: usa a base mais vantajosa entre deduções legais (INSS + dependentes) e o desconto simplificado,
 * aplica a tabela progressiva e depois a redução da Lei 15.270/2025 (zera até R$ 5.000; reduz até R$ 7.350).
 */
export function calcIrrf(input: { income: number; inss: number; dependents: number; table: IrrfTable; allowSimplified?: boolean }): { irrf: number; detail: IrrfDetail } {
  const { income, inss, dependents, table } = input;
  const allowSimplified = input.allowSimplified ?? true;
  const legalBase = Math.max(0, income - inss - dependents * table.dependent_deduction);
  const simplifiedBase = Math.max(0, income - table.simplified_discount);
  const usedSimplified = allowSimplified && simplifiedBase < legalBase;
  const base = round2(usedSimplified ? simplifiedBase : legalBase);

  const bracket = table.brackets.find((item) => item.upto === null || base <= item.upto) ?? table.brackets[table.brackets.length - 1];
  const tableTax = bracket ? Math.max(0, round2(base * bracket.rate - bracket.deduction)) : 0;

  const r = table.reduction;
  let reduction = 0;
  if (income <= r.zero_until) reduction = Math.min(tableTax, r.max);
  else if (income <= r.until) reduction = Math.min(tableTax, Math.max(0, round2(r.a - r.b * income)));

  const irrf = Math.max(0, round2(tableTax - reduction));
  return { irrf, detail: { incomeForReduction: round2(income), base, usedSimplified, tableTax, reduction: round2(reduction) } };
}

/** Estima a folha do mês de um funcionário CLT. */
export function estimatePayroll(input: PayrollInput): PayrollResult {
  const { tables } = input;
  const divisor = Math.max(1, input.weeklyHours * 5);
  const hourlyRate = round2(input.salary / divisor);
  const overtime50 = round2(hourlyRate * 1.5 * input.overtime50Hours);
  const overtime100 = round2(hourlyRate * 2 * input.overtime100Hours);
  const absences = round2((input.salary / 30) * input.absenceDays);
  const vacation = round2((input.salary / 30) * (input.vacationDays ?? 0));
  const gross = Math.max(0, round2(input.salary + overtime50 + overtime100 + input.bonus - absences - vacation));

  const inss = calcInss(gross, tables.inss);
  const { irrf, detail } = calcIrrf({ income: gross, inss, dependents: input.dependents, table: tables.irrf });

  let vt = 0;
  if (input.vtEnabled) {
    const sixPercent = round2(input.salary * tables.params.vt_employee_rate);
    vt = input.vtMonthlyCost !== null ? Math.min(sixPercent, round2(input.vtMonthlyCost)) : sixPercent;
  }

  const otherDeductions = round2(input.otherDeductions);
  const deductionsTotal = round2(inss + irrf + vt + otherDeductions);
  const net = round2(gross - deductionsTotal - input.advances);

  const fgts = round2(gross * tables.params.fgts_rate);
  let employerInss = 0;
  let inssNote = "Dentro do DAS (Simples Nacional): sem INSS patronal separado.";
  if (input.employerRegime === "mei") {
    employerInss = round2(gross * 0.03);
    inssNote = "MEI: 3% sobre o salário.";
  } else if (input.employerRegime === "other") {
    employerInss = round2(gross * input.employerInssRate);
    inssNote = `Percentual informado (${round2(input.employerInssRate * 100)}%). Confirme com o contador.`;
  }

  return {
    hourlyRate,
    salary: round2(input.salary),
    overtime50,
    overtime100,
    absences,
    vacation,
    bonus: round2(input.bonus),
    gross,
    inss,
    irrf,
    irrfDetail: detail,
    vt,
    otherDeductions,
    advances: round2(input.advances),
    deductionsTotal,
    net,
    employer: { fgts, inss: employerInss, inssNote, totalCost: round2(gross + fgts + employerInss) },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Férias e 13º salário (estimativas). Sem dependências: datas "AAAA-MM-DD" tratadas à mão.
// Regras conferidas em gov.br (Ministério do Trabalho e Emprego; ColaboraGov): férias de 30 dias com adicional de 1/3
// (CF art. 7º, XVII), divisíveis em até 3 períodos (um com 14 dias ou mais, os demais com 5 ou mais); 13º em duas
// parcelas (1ª até 30/11, 2ª até 20/12), 1/12 por mês trabalhado, fração de 15 dias ou mais conta como mês.
// Simplificações: salário fixo (sem média de variáveis), sem abono pecuniário (venda de dias), INSS e IRRF das férias
// calculados isoladamente (se pagas no mesmo mês do salário o INSS do mês pode somar), IRRF do 13º só com deduções legais.
// ---------------------------------------------------------------------------------------------------------------------

function isoParse(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Data inválida: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}
function isoFormat(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function isoAddDays(date: string, days: number): string {
  const { y, m, d } = isoParse(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return isoFormat(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}
function isoAddYears(date: string, years: number): string {
  const { y, m, d } = isoParse(date);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return isoFormat(y + years, m, Math.min(d, lastDay));
}
function isoDiffDays(a: string, b: string): number {
  const pa = isoParse(a);
  const pb = isoParse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export type AcquisitionState = "acquiring" | "available" | "expiring" | "overdue";

export interface AcquisitionPeriod {
  index: number;
  /** Início e fim do período aquisitivo (12 meses a partir da admissão). */
  start: string;
  end: string;
  /** Último dia para o funcionário GOZAR as férias (12 meses depois do fim do período aquisitivo). */
  concessiveEnd: string;
  state: AcquisitionState;
  /** Dias até vencer o prazo de gozo (só quando já pode tirar férias); negativo = vencido. */
  daysToExpire: number | null;
}

/** Quantos dias antes do fim do prazo o app avisa que as férias estão vencendo. */
export const VACATION_EXPIRING_DAYS = 90;

/** Períodos aquisitivos desde a admissão até o primeiro ainda em andamento. */
export function acquisitionPeriods(admission: string, today: string): AcquisitionPeriod[] {
  const out: AcquisitionPeriod[] = [];
  for (let index = 1; index <= 60; index += 1) {
    const start = isoAddYears(admission, index - 1);
    if (start > today) break;
    const end = isoAddDays(isoAddYears(admission, index), -1);
    const concessiveEnd = isoAddYears(end, 1);
    let state: AcquisitionState;
    let daysToExpire: number | null = null;
    if (today <= end) state = "acquiring";
    else {
      daysToExpire = isoDiffDays(today, concessiveEnd);
      state = daysToExpire < 0 ? "overdue" : daysToExpire <= VACATION_EXPIRING_DAYS ? "expiring" : "available";
    }
    out.push({ index, start, end, concessiveEnd, state, daysToExpire });
  }
  return out;
}

/** Dias de férias a que o funcionário tem direito no período, conforme as faltas injustificadas (CLT art. 130). */
export function vacationEntitledDays(unjustifiedAbsences: number): number {
  if (unjustifiedAbsences <= 5) return 30;
  if (unjustifiedAbsences <= 14) return 24;
  if (unjustifiedAbsences <= 23) return 18;
  if (unjustifiedAbsences <= 32) return 12;
  return 0;
}

/**
 * Confere se um novo período de gozo cabe nas regras: no máximo 3 períodos, nenhum com menos de 5 dias, um deles
 * com 14 dias ou mais (ou ainda dá para ter), sem passar dos dias a que tem direito e sem sobrar menos de 5 dias.
 * Devolve a mensagem de erro (em português) ou null se está tudo certo.
 */
export function validateVacationSplit(input: { entitled: number; existingDays: number[]; days: number }): string | null {
  const { entitled, existingDays, days } = input;
  if (!Number.isInteger(days) || days < 5) return "Cada período de férias deve ter pelo menos 5 dias.";
  if (entitled <= 0) return "Sem direito a férias neste período aquisitivo (faltas demais).";
  const all = [...existingDays, days];
  if (all.length > 3) return "As férias podem ser divididas em no máximo 3 períodos.";
  const total = all.reduce((sum, value) => sum + value, 0);
  if (total > entitled) return `Passa dos ${entitled} dias de direito (já programados: ${existingDays.reduce((sum, value) => sum + value, 0)}).`;
  const remaining = entitled - total;
  if (remaining > 0 && remaining < 5) return `Sobrariam só ${remaining} dia(s); o menor período é de 5 dias. Ajuste a duração.`;
  const slotsLeft = 3 - all.length;
  const biggest = Math.max(...all);
  if (biggest < 14 && !(slotsLeft >= 1 && remaining >= 14)) return "Um dos períodos precisa ter pelo menos 14 dias.";
  return null;
}

export interface VacationPayInput {
  salary: number;
  days: number;
  dependents: number;
  tables: PayrollTables;
}

export interface VacationPayResult {
  daysAmount: number;
  oneThird: number;
  gross: number;
  inss: number;
  irrf: number;
  irrfDetail: IrrfDetail;
  net: number;
  fgts: number;
}

/** Férias: salário/30 × dias + 1/3 constitucional; INSS e IRRF sobre o total (isolados). */
export function calcVacationPay(input: VacationPayInput): VacationPayResult {
  const { tables } = input;
  const daysAmount = round2((input.salary / 30) * input.days);
  const oneThird = round2(daysAmount / 3);
  const gross = round2(daysAmount + oneThird);
  const inss = calcInss(gross, tables.inss);
  const { irrf, detail } = calcIrrf({ income: gross, inss, dependents: input.dependents, table: tables.irrf });
  return {
    daysAmount,
    oneThird,
    gross,
    inss,
    irrf,
    irrfDetail: detail,
    net: round2(gross - inss - irrf),
    fgts: round2(gross * tables.params.fgts_rate),
  };
}

/** Avos de 13º no ano: 1/12 por mês em que trabalhou 15 dias ou mais (da admissão, ou 1º de janeiro, até 31/12 ou a saída). */
export function thirteenthAvos(admission: string | null, year: number, endDate?: string | null): number {
  let avos = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthStart = isoFormat(year, month, 1);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = isoFormat(year, month, lastDay);
    const from = admission && admission > monthStart ? admission : monthStart;
    const to = endDate && endDate < monthEnd ? endDate : monthEnd;
    if (from > to) continue;
    if (isoDiffDays(from, to) + 1 >= 15) avos += 1;
  }
  return avos;
}

export function thirteenthDeadlines(year: number): { first: string; second: string } {
  return { first: `${year}-11-30`, second: `${year}-12-20` };
}

export interface ThirteenthInput {
  salary: number;
  avos: number;
  dependents: number;
  tables: PayrollTables;
}

export interface ThirteenthResult {
  total: number;
  /** 1ª parcela: metade, sem descontos (até 30/11). */
  firstInstallment: number;
  /** 2ª parcela bruta: o que falta para completar (até 20/12). */
  secondGross: number;
  /** INSS e IRRF do 13º inteiro, descontados na 2ª parcela. */
  inss: number;
  irrf: number;
  irrfDetail: IrrfDetail;
  secondNet: number;
  fgts: number;
}

/** 13º: salário × avos/12; 1ª parcela = metade; INSS e IRRF do total saem na 2ª parcela. */
export function calcThirteenth(input: ThirteenthInput): ThirteenthResult {
  const { tables } = input;
  const total = round2((input.salary * input.avos) / 12);
  const firstInstallment = round2(total / 2);
  const secondGross = round2(total - firstInstallment);
  const inss = calcInss(total, tables.inss);
  const { irrf, detail } = calcIrrf({ income: total, inss, dependents: input.dependents, table: tables.irrf, allowSimplified: false });
  return {
    total,
    firstInstallment,
    secondGross,
    inss,
    irrf,
    irrfDetail: detail,
    secondNet: round2(secondGross - inss - irrf),
    fgts: round2(total * tables.params.fgts_rate),
  };
}
