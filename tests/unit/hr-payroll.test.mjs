import test from "node:test";
import assert from "node:assert/strict";
import { calcInss, calcIrrf, estimatePayroll, round2 } from "../../src/lib/hr/payroll.ts";

// Tabelas 2026 conferidas em gov.br/INSS (Portaria MPS/MF 13/2026) e gov.br/Receita Federal (Lei 15.270/2025).
const tables = {
  inss: {
    brackets: [
      { upto: 1621.0, rate: 0.075 },
      { upto: 2902.84, rate: 0.09 },
      { upto: 4354.27, rate: 0.12 },
      { upto: 8475.55, rate: 0.14 },
    ],
  },
  irrf: {
    brackets: [
      { upto: 2428.8, rate: 0, deduction: 0 },
      { upto: 2826.65, rate: 0.075, deduction: 182.16 },
      { upto: 3751.05, rate: 0.15, deduction: 394.16 },
      { upto: 4664.68, rate: 0.225, deduction: 675.49 },
      { upto: null, rate: 0.275, deduction: 908.73 },
    ],
    dependent_deduction: 189.59,
    simplified_discount: 607.2,
    reduction: { zero_until: 5000, max: 312.89, a: 978.62, b: 0.133145, until: 7350 },
  },
  params: { minimum_wage: 1621, fgts_rate: 0.08, vt_employee_rate: 0.06 },
};

const base = {
  salary: 3000,
  weeklyHours: 44,
  dependents: 0,
  vtEnabled: false,
  vtMonthlyCost: null,
  overtime50Hours: 0,
  overtime100Hours: 0,
  absenceDays: 0,
  bonus: 0,
  otherDeductions: 0,
  advances: 0,
  employerRegime: "simples",
  employerInssRate: 0,
  tables,
};

test("INSS progressivo por faixa (tabela 2026)", () => {
  assert.equal(calcInss(0, tables.inss), 0);
  assert.equal(calcInss(1000, tables.inss), 75); // só a 1ª faixa
  assert.equal(calcInss(1621, tables.inss), 121.58); // 1.621 × 7,5% = 121,575
  assert.equal(calcInss(3000, tables.inss), 248.6); // 121,575 + 115,3656 + 11,6592
  // teto: acima de 8.475,55 não cobra mais
  assert.equal(calcInss(8475.55, tables.inss), calcInss(20000, tables.inss));
  assert.equal(calcInss(8475.55, tables.inss), 988.09);
});

test("IRRF: exemplos da própria Receita Federal (desconto simplificado + redução da Lei 15.270)", () => {
  // R$ 4.500: imposto da tabela 200,39, redução cobre tudo -> 0
  const a = calcIrrf({ income: 4500, inss: 0, dependents: 0, table: tables.irrf });
  assert.equal(a.detail.base, 3892.8);
  assert.equal(a.detail.tableTax, 200.39);
  assert.equal(a.irrf, 0);
  // R$ 6.000: tabela 574,29 - redução 179,75 = 394,54
  const b = calcIrrf({ income: 6000, inss: 0, dependents: 0, table: tables.irrf });
  assert.equal(b.detail.base, 5392.8);
  assert.equal(b.detail.tableTax, 574.29);
  assert.equal(b.detail.reduction, 179.75);
  assert.equal(b.irrf, 394.54);
  assert.equal(b.detail.usedSimplified, true);
});

test("IRRF: acima de R$ 7.350 não há redução; dependentes reduzem a base legal", () => {
  const high = calcIrrf({ income: 9000, inss: 988.09, dependents: 0, table: tables.irrf });
  assert.equal(high.detail.reduction, 0);
  assert.ok(high.irrf > 0);
  const noDeps = calcIrrf({ income: 7000, inss: 900, dependents: 0, table: tables.irrf });
  const twoDeps = calcIrrf({ income: 7000, inss: 900, dependents: 2, table: tables.irrf });
  assert.ok(twoDeps.irrf <= noDeps.irrf);
  // base legal quando ela é menor que o desconto simplificado
  const legal = calcIrrf({ income: 3000, inss: 1500, dependents: 0, table: tables.irrf });
  assert.equal(legal.detail.usedSimplified, false);
  assert.equal(legal.detail.base, 1500);
});

test("folha: salário de R$ 3.000, sem extras", () => {
  const r = estimatePayroll(base);
  assert.equal(r.gross, 3000);
  assert.equal(r.inss, 248.6);
  assert.equal(r.irrf, 0); // renda <= 5.000 e redução zera o imposto
  assert.equal(r.vt, 0);
  assert.equal(r.net, 2751.4);
  assert.equal(r.employer.fgts, 240);
  assert.equal(r.employer.inss, 0);
  assert.equal(r.employer.totalCost, 3240);
});

test("folha: horas extras (divisor 220 para 44 h) e faltas (salário/30)", () => {
  const r = estimatePayroll({ ...base, salary: 2200, overtime50Hours: 10, overtime100Hours: 2, absenceDays: 1 });
  assert.equal(r.hourlyRate, 10); // 2200 / 220
  assert.equal(r.overtime50, 150); // 10 × 10 × 1,5
  assert.equal(r.overtime100, 40); // 2 × 10 × 2
  assert.equal(r.absences, 73.33); // 2200 / 30
  assert.equal(r.gross, 2316.67);
  // 40 h semanais -> divisor 200
  assert.equal(estimatePayroll({ ...base, salary: 2000, weeklyHours: 40 }).hourlyRate, 10);
});

test("folha: vale-transporte desconta 6% do salário, limitado ao custo do VT", () => {
  assert.equal(estimatePayroll({ ...base, vtEnabled: true }).vt, 180);
  assert.equal(estimatePayroll({ ...base, vtEnabled: true, vtMonthlyCost: 120 }).vt, 120);
  assert.equal(estimatePayroll({ ...base, vtEnabled: true, vtMonthlyCost: 400 }).vt, 180);
  assert.equal(estimatePayroll({ ...base, vtEnabled: false, vtMonthlyCost: 400 }).vt, 0);
});

test("folha: vales e outros descontos saem do líquido; bônus entra na base dos encargos", () => {
  const r = estimatePayroll({ ...base, bonus: 500, advances: 200, otherDeductions: 50 });
  assert.equal(r.gross, 3500);
  assert.equal(r.inss, calcInss(3500, tables.inss));
  assert.equal(r.deductionsTotal, round2(r.inss + r.irrf + r.vt + 50));
  assert.equal(r.net, round2(3500 - r.deductionsTotal - 200));
  assert.equal(r.employer.fgts, 280);
});

test("custo da empresa: Simples sem INSS separado, MEI 3%, outro regime com percentual informado", () => {
  assert.equal(estimatePayroll({ ...base, employerRegime: "mei" }).employer.inss, 90);
  const other = estimatePayroll({ ...base, employerRegime: "other", employerInssRate: 0.2 });
  assert.equal(other.employer.inss, 600);
  assert.equal(other.employer.totalCost, 3000 + 240 + 600);
  assert.match(other.employer.inssNote, /contador/);
});

test("faltas maiores que o salário não geram bruto negativo", () => {
  const r = estimatePayroll({ ...base, absenceDays: 40 });
  assert.equal(r.gross, 0);
  assert.equal(r.inss, 0);
  assert.equal(r.irrf, 0);
});

test("o módulo não tem números de tabela escritos nele (vêm do banco)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/hr/payroll.ts", "utf8");
  for (const literal of ["2428.8", "2826.65", "4664.68", "908.73", "607.2", "189.59", "1621", "8475.55", "0.133145", "978.62"]) {
    assert.ok(!src.includes(literal), `${literal} não pode estar no código`);
  }
  assert.ok(!/^\s*import\s/m.test(src));
});
