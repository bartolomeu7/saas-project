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
export function calcIrrf(input: { income: number; inss: number; dependents: number; table: IrrfTable }): { irrf: number; detail: IrrfDetail } {
  const { income, inss, dependents, table } = input;
  const legalBase = Math.max(0, income - inss - dependents * table.dependent_deduction);
  const simplifiedBase = Math.max(0, income - table.simplified_discount);
  const usedSimplified = simplifiedBase < legalBase;
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
  const gross = Math.max(0, round2(input.salary + overtime50 + overtime100 + input.bonus - absences));

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
