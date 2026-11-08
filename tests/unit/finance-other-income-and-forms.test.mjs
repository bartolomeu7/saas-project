import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { computeNetResult, sumOperatingExpenses, sumOtherIncome } from "../../src/lib/finance/dre.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Achado da rodada de uso real (teste1, 08/11/2026): receita avulsa de R$ 60 entrava no caixa mas não no resultado.
test("receita lançada à mão entra em 'outras receitas'; recebimento de venda não (já está no faturamento)", () => {
  const rows = [
    { amount: "60.00", source_type: null }, // receita avulsa
    { amount: 59.9, source_type: "sale_payment" }, // recebimento de venda
    { amount: 380, source_type: "sale_payment" },
    { amount: 25, source_type: null },
  ];
  assert.equal(sumOtherIncome(rows), 85);
  assert.equal(sumOtherIncome([]), 0);
  assert.equal(sumOtherIncome([{ amount: 10, source_type: "sale_payment" }]), 0);
});

test("despesa operacional ignora compra de estoque e estorno de venda", () => {
  const rows = [
    { amount: 120, source_type: null }, // despesa avulsa
    { amount: 954, source_type: "accounts_payable" },
    { amount: 300, source_type: "accounts_payable_payment" },
    { amount: 59.9, source_type: "sale_payment_refund" },
    { amount: "30.50", source_type: null },
  ];
  assert.equal(sumOperatingExpenses(rows), 150.5);
});

test("resultado = faturamento − custo + outras receitas − despesas (números reais da 3ª rodada)", () => {
  // faturamento 938,80; CMV 298,60; despesa 120; resultado já conferido 520,20 (sem receita avulsa)
  const base = { revenue: 938.8, costOfGoods: 298.6, otherIncome: 0, operatingExpenses: 120 };
  assert.equal(Number(computeNetResult(base).toFixed(2)), 520.2);
  // com a receita avulsa de R$ 60 passa a ser 580,20
  assert.equal(Number(computeNetResult({ ...base, otherIncome: 60 }).toFixed(2)), 580.2);
});

test("Financeiro, Relatórios e CSV usam as mesmas regras e mostram 'Outras receitas'", () => {
  const finance = read("src/lib/finance/queries.ts");
  const reports = read("src/lib/reports/queries.ts");
  assert.ok(finance.includes("sumOtherIncome") && finance.includes("computeNetResult"));
  assert.ok(reports.includes("sumOtherIncome") && reports.includes("computeNetResult"));
  assert.ok(read("src/app/(app)/app/financeiro/page.tsx").includes("Outras receitas"));
  assert.ok(read("src/app/(app)/app/relatorios/export/route.ts").includes("Outras receitas"));
});

// Achado da rodada de uso real: formulários apagavam tudo que o usuário digitou quando o servidor devolvia erro.
test("formulários com campos mantêm o digitado quando há erro (onReset com useKeepInputOnError)", () => {
  const files = walk("src/components").filter((f) => f.endsWith(".tsx"));
  const skipped = ["two-factor-panel", "two-factor-verify-form", "complete-sale-button", "customer-documents-tab", "submit-button"];
  const missing = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("useFormState(")) continue;
    if (skipped.some((name) => file.includes(name))) continue;
    const bindings = (src.match(/useFormState\(/g) ?? []).length;
    const hooks = (src.match(/useKeepInputOnError\(/g) ?? []).length;
    const resets = (src.match(/onReset=\{keepInput\}/g) ?? []).length;
    // Formulários só de botão (status, remover) não têm campos e ficam de fora.
    const buttonOnly = (src.match(/status="|removeMemberAction|deleteProfessionalBlockAction|setAppointmentStatusAction/g) ?? []).length > 0;
    if (hooks !== resets) missing.push(file + ": hook sem onReset");
    if (hooks === 0 && !buttonOnly) missing.push(file + ": sem useKeepInputOnError");
    assert.ok(hooks <= bindings, file);
  }
  assert.deepEqual(missing, []);
});

test("o hook só cancela o 'limpar' do formulário quando há erro", () => {
  const hook = read("src/hooks/use-keep-input-on-error.ts");
  assert.ok(hook.includes("preventDefault"));
  assert.ok(hook.includes("state?.error"));
  assert.ok(!hook.includes("useRef"), "não deve usar ref atualizada durante a renderização");
});
