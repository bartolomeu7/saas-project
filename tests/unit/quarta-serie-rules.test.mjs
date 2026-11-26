import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { supplierSchema } from "../../src/lib/validations/supplier.ts";
import { buildReportCsv, csvNumber, csvText, neutralizeFormula } from "../../src/lib/reports/csv.ts";

const read = (rel) => readFileSync(rel, "utf8");
const parse = (input) => supplierSchema.safeParse({ name: "Fornecedor Ok", ...input });
const firstError = (input) => {
  const result = parse(input);
  return result.success ? null : result.error.issues[0].message;
};

/** 4ª série (20/11/2026): o cadastro de fornecedor aceitava quase tudo. */
test("fornecedor: nome obrigatório, com letras, até 180 e sem espaços repetidos", () => {
  assert.equal(parse({ name: "  T4   Maria    Silva  " }).data.name, "T4 Maria Silva");
  assert.match(firstError({ name: "" }), /nome do fornecedor/);
  assert.match(firstError({ name: "     " }), /nome do fornecedor/);
  assert.match(firstError({ name: "12345" }), /com letras/);
  assert.equal(parse({ name: "3M do Brasil" }).success, true);
  assert.match(firstError({ name: "a".repeat(181) }), /muito longo/);
  assert.equal(parse({ name: "a".repeat(180) }).success, true);
});

test("fornecedor: caracteres invisíveis e de inversão são removidos", () => {
  assert.equal(parse({ name: "T4​​ZW" }).data.name, "T4ZW");
  assert.equal(parse({ name: "T4 ab‮cd" }).data.name, "T4 abcd");
});

test("fornecedor: documento, e-mail, telefone, UF, CEP, cidade e número", () => {
  assert.match(firstError({ document: "11.222.333/0001-82" }), /CNPJ inválido/);
  assert.match(firstError({ document: "111.111.111-11" }), /CPF inválido/);
  assert.equal(parse({ document: "11.222.333/0001-81" }).success, true);
  assert.equal(parse({ document: "MG-12.345.678" }).success, true);

  assert.match(firstError({ email: "semarroba" }), /e-mail válido/);
  assert.match(firstError({ email: "a@b" }), /e-mail válido/);
  assert.match(firstError({ email: "a b@c.com" }), /e-mail válido/);
  assert.match(firstError({ email: "a".repeat(290) + "@a.com" }), /Máximo de 160/);
  assert.equal(parse({ email: "VENDAS@Alfa.COM.br" }).data.email, "vendas@alfa.com.br");

  assert.match(firstError({ phone: "abc123" }), /Telefone inválido/);
  assert.match(firstError({ phone: "123" }), /Telefone inválido/);
  assert.match(firstError({ whatsapp: "1".repeat(40) }), /Máximo de 32|WhatsApp inválido/);
  assert.equal(parse({ whatsapp: "+55 11 98888-7777" }).success, true);

  assert.match(firstError({ state: "XX" }), /UF inválida/);
  assert.equal(parse({ state: "sp" }).data.state, "SP");
  assert.match(firstError({ postal_code: "12345" }), /CEP inválido/);
  assert.match(firstError({ postal_code: "abcde-fgh" }), /CEP inválido/);
  assert.equal(parse({ postal_code: "01001-000" }).success, true);
  assert.match(firstError({ city: "12345" }), /cidade válida/);
  assert.equal(parse({ city: "São José dos Pinhais" }).success, true);
  assert.match(firstError({ address_number: "-5" }), /Número do endereço/);
  assert.equal(parse({ address_number: "S/N" }).success, true);
});

test("fornecedor: limites de endereço, complemento e observações; campos vazios ficam vazios", () => {
  assert.match(firstError({ address: "a".repeat(201) }), /Máximo de 200/);
  assert.match(firstError({ complement: "a".repeat(101) }), /Máximo de 100/);
  assert.match(firstError({ notes: "a".repeat(2001) }), /Máximo de 2000/);
  const minimal = parse({}).data;
  assert.equal(minimal.document, "");
  assert.equal(minimal.email, "");
  assert.equal(minimal.status, "active");
  assert.equal(parse({ status: "inactive" }).data.status, "inactive");
  assert.equal(parse({ status: "qualquer" }).data.status, "active");
});

test("ações do fornecedor: nome e documento repetidos (com ou sem pontuação) e cadastro inexistente", () => {
  const src = read("src/lib/suppliers/actions.ts");
  assert.equal((src.match(/nameInUse\(supabase, "suppliers"/g) ?? []).length, 2);
  assert.equal((src.match(/await documentInUse\(supabase/g) ?? []).length, 2);
  assert.ok(src.includes("documentVariants(document)"));
  assert.ok(src.includes("Já existe um fornecedor com esse nome."));
  assert.ok(src.includes("Fornecedor não encontrado."));
  assert.ok(read("src/lib/validations/name-in-use.ts").includes('"suppliers"'));
});

test("CSV do relatório: texto que parece fórmula é neutralizado e números saem em padrão brasileiro", () => {
  assert.equal(neutralizeFormula("=HYPERLINK(\"http://x\")"), "'=HYPERLINK(\"http://x\")");
  assert.equal(neutralizeFormula("+55 11"), "'+55 11");
  assert.equal(neutralizeFormula("-2+3"), "'-2+3");
  assert.equal(neutralizeFormula("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(neutralizeFormula("Shampoo"), "Shampoo");
  assert.equal(csvText('Vela "Lua"'), '"Vela ""Lua"""');
  assert.equal(csvText("=1+1"), '"\'=1+1"');
  assert.equal(csvNumber(2902.3), "2902,30");
  assert.equal(csvNumber(-12.5), "-12,50");
  assert.equal(csvNumber(0.5, 3), "0,500");
  assert.equal(csvNumber(Number.NaN), "");
});

test("CSV do relatório: separador ponto e vírgula, BOM, todos os itens, dias e formas de pagamento", () => {
  const report = {
    range: { period: "month", from: "", to: "", fromDate: "2026-11-01", toDate: "2026-11-26", label: "Este mês" },
    summary: { revenue: 1234.5, costOfGoods: 100, completedSales: 3, averageTicket: 411.5, otherIncome: 0, operatingExpenses: 50, netResult: 1084.5, received: 1234.5, refunds: 0, accountsReceivable: 0, accountsPayable: 20, overdueReceivables: 0, overduePayables: 1 },
    salesTrend: [{ date: "2026-11-20", label: "20/11", value: 1234.5 }],
    topItems: [],
    allItems: Array.from({ length: 12 }, (_, i) => ({ description: i === 0 ? "=CMD()" : `Item ${i}`, quantity: 1.5, revenue: 100 - i, itemType: i % 2 ? "service" : "product" })),
    paymentMethods: [{ method: "pix", label: "Pix", amount: 1234.5 }],
    appointments: { total: 4, scheduled: 1, confirmed: 0, completed: 2, cancelled: 1, noShow: 0 },
    inventory: { lowStock: 1, outOfStock: 2 },
  };
  const csv = buildReportCsv(report);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"Faturamento";1234,50'));
  assert.ok(csv.includes('"2026-11-20";1234,50'));
  assert.ok(csv.includes('"Pix";1234,50'));
  assert.ok(csv.includes("\"'=CMD()\""));
  assert.equal((csv.match(/"Item \d+"/g) ?? []).length, 11);
  assert.ok(!csv.includes(",50;") && !/\d\.\d\d(;|\r)/.test(csv));
});

test("estorno de compra e confirmação devolvem o motivo em vez de derrubar a página", () => {
  const actions = read("src/lib/purchases/actions.ts");
  assert.ok(!actions.includes("throw new Error(error.message)"));
  assert.ok(actions.includes("Não foi possível estornar o recebimento."));
  const confirm = read("src/components/app/confirm-dialog.tsx");
  assert.ok(confirm.includes("toast.error(result.error)"));
  const page = read("src/app/(app)/app/compras/[id]/page.tsx");
  assert.ok(page.includes("return await cancelPurchaseReceiptAction"));
  assert.ok(page.includes("<CancelPurchaseOrderButton"));
  assert.ok(read("src/components/app/cancel-purchase-order-button.tsx").includes("<FormMessage state={state}"));
});

test("migrations: estorno de recebimento barra conta parcial e estorno de lançamento manual tem reversão", () => {
  const partial = read("supabase/migrations/20261120200000_cancel_receipt_block_partial_payable.sql");
  assert.ok(partial.includes("in ('paid','partial')"));
  assert.ok(read("supabase/rollback/20261120200000_cancel_receipt_block_partial_payable.down.sql").includes("block-partial"));
  const entry = read("supabase/migrations/20261120210000_cancel_manual_financial_entry.sql");
  assert.ok(entry.includes("source_type is not null"));
  assert.ok(entry.includes("Apenas owner/admin"));
  assert.ok(read("supabase/rollback/20261120210000_cancel_manual_financial_entry.down.sql").includes("drop function"));
  assert.ok(read("src/lib/finance/actions.ts").includes('rpc("cancel_manual_financial_entry"'));
});

test("Chat: valor negativo ou absurdo avisa em vez de ser ignorado em silêncio", async () => {
  const { parseExtras } = await import("../../src/lib/chat/agenda-agendar.ts");
  assert.deepEqual(parseExtras("valor -50").unsupported, ["valor-invalido"]);
  assert.deepEqual(parseExtras("cobrar R$ -10").unsupported, ["valor-invalido"]);
  assert.deepEqual(parseExtras("valor 99999999999").unsupported, ["valor-invalido"]);
  assert.deepEqual(parseExtras("valor 80").unsupported, []);
  assert.equal(parseExtras("valor 80").priceOverride, 80);
  assert.equal(parseExtras("grátis").priceOverride, 0);
  assert.ok(read("src/lib/chat/agenda-turn.ts").includes("Esse valor não vale."));
});

test("Relatórios: agenda de Este mês/Este ano conta também o que ainda vai acontecer; exportação com todos os itens", () => {
  const q = read("src/lib/reports/queries.ts");
  assert.ok(q.includes("export function appointmentsWindowEnd"));
  assert.ok(q.includes("p_appointments_to: appointmentsWindowEnd(range)"));
  assert.ok(read("src/lib/reports/summary.ts").includes("allItems"));
  assert.ok(read("src/app/(app)/app/relatorios/export/route.ts").includes("buildReportCsv(report)"));
});

test("Financeiro, Caixa e Estoque: estornar lançamento, histórico de fechamentos e movimentações", () => {
  const fin = read("src/app/(app)/app/financeiro/page.tsx");
  assert.ok(fin.includes("cancelFinancialEntryAction(entry.id)"));
  assert.ok(fin.includes("categoryNames.get(entry.category_id)"));
  assert.ok(fin.includes("Mostrando as 100 contas"));
  assert.ok(read("src/app/(app)/app/caixa/page.tsx").includes("Fechamentos anteriores"));
  const stock = read("src/app/(app)/app/estoque/page.tsx");
  assert.ok(stock.includes("listRecentStockMovements"));
  assert.ok(stock.includes("Últimas movimentações"));
});

test("estoque: rótulos e variação das movimentações", async () => {
  const { stockSourceLabel, stockMovementDelta, formatStockDelta } = await import("../../src/lib/products/stock-labels.ts");
  assert.equal(stockSourceLabel("purchase"), "Compra recebida");
  assert.equal(stockSourceLabel("purchase_cancellation"), "Recebimento estornado");
  assert.equal(stockSourceLabel("novo_codigo"), "novo_codigo");
  assert.equal(stockMovementDelta({ direction: "in", quantity: 5, stock_before: 1, stock_after: 6 }), 5);
  assert.equal(stockMovementDelta({ direction: "out", quantity: 2, stock_before: 6, stock_after: 4 }), -2);
  assert.equal(stockMovementDelta({ direction: "adjustment", quantity: 7, stock_before: 15, stock_after: 8 }), -7);
  assert.equal(formatStockDelta(5), "+5");
  assert.equal(formatStockDelta(-2.5), "−2,5");
  assert.equal(formatStockDelta(0), "0");
});
