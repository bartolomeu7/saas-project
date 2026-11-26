// Correções altas e médias da bateria de Operação (26/11/2026). As regras de banco: tests/sql/operacao_altos_medios.sql.
import test from "node:test";
import assert from "node:assert/strict";
import { sumPayableBalance } from "../../src/lib/finance/dre.ts";
import { checkOrderItems } from "../../src/lib/validations/purchase-items.ts";
import { formatQuantity } from "../../src/lib/products/stock-labels.ts";
import { countByStatus } from "../../src/lib/agenda/stats.ts";

test("a pagar soma o saldo das contas, inclusive as pagas em parte", () => {
  assert.equal(sumPayableBalance([{ amount: 100, paid_amount: 0 }, { amount: "50.50", paid_amount: "20.25" }, { amount: 10, paid_amount: null }]), 140.25);
});

const ok = { product_id: "p1", quantity: 2, unit_cost: 3 };
const blank = { product_id: "", quantity: 1, unit_cost: 0 };

test("pedido: linha intocada é ignorada; custo zero é aceito", () => {
  assert.deepEqual(checkOrderItems([ok, blank, { ...ok, unit_cost: 0 }]), { items: [ok, { ...ok, unit_cost: 0 }] });
  assert.deepEqual(checkOrderItems([blank]), { error: "Adicione pelo menos um produto ao pedido." });
});

test("pedido: linha incompleta ou inválida recusa o pedido apontando o número", () => {
  for (const [bad, message] of [
    [{ ...ok, quantity: 0 }, "Item 2: informe uma quantidade maior que zero."],
    [{ ...ok, quantity: -1 }, "Item 2: informe uma quantidade maior que zero."],
    [{ ...ok, quantity: null }, "Item 2: informe uma quantidade maior que zero."],
    [{ ...ok, unit_cost: -5 }, "Item 2: o custo não pode ser negativo."],
    [{ ...ok, product_id: "" }, "Item 2: selecione o produto."],
    [{ ...blank, quantity: 4 }, "Item 2: selecione o produto."],
  ]) {
    assert.deepEqual(checkOrderItems([ok, bad]), { error: message });
  }
});

test("quantidades em português", () => {
  assert.equal(formatQuantity(9.001), "9,001");
  assert.equal(formatQuantity("2.375"), "2,375");
  assert.equal(formatQuantity(9000), "9.000");
});

test("contadores contam a lista filtrada", () => {
  const rows = ["scheduled", "scheduled", "confirmed", "completed", "cancelled"].map((status) => ({ status }));
  assert.deepEqual(countByStatus(rows), { total: 5, scheduled: 2, confirmed: 1, completed: 1 });
});
