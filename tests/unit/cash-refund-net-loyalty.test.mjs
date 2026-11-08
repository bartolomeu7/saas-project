import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const MIGRATION = "supabase/migrations/20261108120000_cash_refund_and_net_loyalty_points.sql";

test("migration, rollback e bateria SQL existem", () => {
  for (const rel of [
    MIGRATION,
    "supabase/rollback/20261108120000_cash_refund_and_net_loyalty_points.down.sql",
    "tests/sql/cash_refund_net_loyalty.sql",
  ]) {
    assert.ok(existsSync(path.join(ROOT, rel)), `falta ${rel}`);
  }
});

test("estorno de pagamento gera saída no caixa só se o pagamento entrou no caixa", () => {
  const sql = read(MIGRATION);
  assert.ok(sql.includes("new.status = 'refunded'"));
  assert.ok(sql.includes("old.status = 'refunded'"), "precisa ser idempotente (só na transição)");
  assert.ok(sql.includes("select 1 from public.cash_movements where sale_payment_id = new.id"), "só estorna o que entrou");
  assert.ok(/'out', new\.amount, new\.method/.test(sql), "saída no mesmo método de pagamento");
});

test("pontos de fidelidade usam o total pago, não o valor bruto dos itens", () => {
  const sql = read(MIGRATION);
  assert.ok(sql.includes("v_paid_ratio"));
  assert.ok(sql.includes("v_item.total_amount * v_paid_ratio * v_settings.points_per_currency_unit"));
  assert.ok(sql.includes("least(1, greatest(0, v_sale.total_amount) / v_items_sum)"), "nunca passa de 100% do item");
});

test("o rollback restaura o cálculo antigo", () => {
  const down = read("supabase/rollback/20261108120000_cash_refund_and_net_loyalty_points.down.sql");
  assert.ok(!down.includes("v_paid_ratio"));
  assert.ok(!down.includes("'refunded'"));
});

test("a tela do caixa identifica o estorno", () => {
  assert.ok(read("src/components/app/cash-movements-table.tsx").includes("Estorno de venda"));
});
