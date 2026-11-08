import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { todayDateSaoPaulo } from "../../src/lib/timezone.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Achado da rodada de uso real (08/11/2026): o banco grava o dia de Greenwich; depois das 21h de São Paulo já é "amanhã".
test("limites de data do período são o dia de São Paulo, não o dia UTC do instante", () => {
  // início do mês em São Paulo (01/11 00:00) = 03:00 UTC
  assert.equal(todayDateSaoPaulo(new Date("2026-11-01T03:00:00.000Z")), "2026-11-01");
  // fim do dia 08/11 em São Paulo (23:59:59.999) = 02:59:59.999 UTC do dia 09
  assert.equal(todayDateSaoPaulo(new Date("2026-11-09T02:59:59.999Z")), "2026-11-08");
  // recebimento às 22:30 de 08/11 (01:30 UTC de 09/11)
  assert.equal(todayDateSaoPaulo(new Date("2026-11-09T01:30:00.000Z")), "2026-11-08");
});

test("Financeiro e Relatórios filtram occurred_on pelos limites de São Paulo", () => {
  const finance = read("src/lib/finance/queries.ts");
  const reports = read("src/lib/reports/queries.ts");
  for (const [name, src] of [["finance", finance], ["reports", reports]]) {
    assert.ok(!/occurred_on",\s*(range\.)?(from|to)\.slice\(0, ?10\)/.test(src), `${name} ainda usa o dia UTC nos limites`);
    assert.ok(src.includes("todayDateSaoPaulo(new Date("), `${name} não converte os limites para São Paulo`);
  }
  assert.ok(!finance.includes("row.sold_at.slice(0, 10)"), "vencimento do a receber ainda usa o dia UTC");
});

test("migração troca current_date/::date por São Paulo, aborta se não achar o trecho e tem rollback", () => {
  const up = read("supabase/migrations/20261108140000_dates_sao_paulo.sql");
  assert.ok(up.includes("function public.today_sao_paulo()") && up.includes("'America/Sao_Paulo'"));
  for (const fn of [
    "create_financial_entry(",
    "create_financial_entry_from_sale_payment()",
    "pay_accounts_payable(",
    "create_purchase_order(",
    "receive_purchase_order(",
  ]) {
    assert.ok(up.includes(fn), `migração não trata ${fn}`);
  }
  assert.ok(up.includes("Migração abortada"), "deve abortar se o trecho esperado não for encontrado");
  // o backfill só mexe nos lançamentos automáticos de venda, nunca nos digitados
  assert.ok(/source_type in \('sale_payment', 'sale_payment_refund'\)/.test(up));
  assert.ok(!/update public\.financial_entries[^;]*source_type is null/i.test(up));
  assert.ok(existsSync("supabase/rollback/20261108140000_dates_sao_paulo.down.sql"));
  assert.ok(existsSync("tests/sql/dates_sao_paulo.sql"));
  const down = read("supabase/rollback/20261108140000_dates_sao_paulo.down.sql");
  assert.ok(down.includes("drop function if exists public.today_sao_paulo()"));
  assert.ok(down.includes("Rollback abortado"), "rollback deve abortar se alguma função ainda depender do helper");
});
