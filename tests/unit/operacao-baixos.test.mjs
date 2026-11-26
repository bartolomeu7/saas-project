// Itens baixos da bateria de Operação (26/11/2026). As regras de banco: tests/sql/operacao_baixos.sql.
import test from "node:test";
import assert from "node:assert/strict";
import { checkOrderItems } from "../../src/lib/validations/purchase-items.ts";
import { stockReasonLabel } from "../../src/lib/products/stock-labels.ts";
import { cashMovementOrigin } from "../../src/lib/cash-register/origin.ts";
import { isCalendarDate } from "../../src/lib/agenda/week-view.ts";

test("pedido: custo vazio é recusado; custo 0 digitado é aceito", () => {
  const line = { product_id: "p1", quantity: 2, unit_cost: null };
  assert.deepEqual(checkOrderItems([line]), { error: "Item 1: informe o custo (use 0 se não houve custo)." });
  assert.ok("items" in checkOrderItems([{ ...line, unit_cost: 0 }]));
  assert.ok("items" in checkOrderItems([{ ...line, unit_cost: 3 }, { product_id: "", quantity: 1, unit_cost: null }]));
});

test("motivos do estoque saem em português e o texto digitado fica como está", () => {
  assert.equal(stockReasonLabel("sale"), "Venda");
  assert.equal(stockReasonLabel("sale_cancelled"), "Venda cancelada");
  assert.equal(stockReasonLabel("contagem de sábado"), "contagem de sábado");
});

test("origem da movimentação do caixa diz de qual módulo veio", () => {
  const origin = (description, source = "manual") => cashMovementOrigin({ source, description });
  assert.equal(origin("Pagamento de venda", "sale_payment"), "Pagamento de venda");
  assert.equal(origin("Estorno de pagamento de venda — 1a2b"), "Estorno de venda");
  assert.equal(origin("Estorno de venda 89e45bab"), "Estorno de venda");
  assert.equal(origin("Estorno: Vale — Maria"), "Estorno");
  assert.equal(origin("Pagamento de fornecedor — Compra #PC-1"), "Compras");
  for (const text of ["Vale — Maria", "Pagamento RH — Maria (01/11 a 07/11)", "Férias — Ana (01/11 a 30/11)", "13º salário (1ª parcela) — Ana (2026)"]) {
    assert.equal(origin(text), "RH", text);
  }
  assert.equal(origin("Sangria para o cofre"), "Lançamento manual");
});

test("data que não existe no calendário é recusada", () => {
  assert.equal(isCalendarDate("2028-02-29"), true);
  for (const bad of ["2026-02-31", "2026-13-01", "26-11-2026", "abc", ""]) assert.equal(isCalendarDate(bad), false, bad);
});
