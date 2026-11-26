// Correções críticas e altas da bateria de 25/11/2026. As regras de banco são provadas em tests/sql/bateria_criticos_altos.sql.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customRangeSaoPaulo } from "../../src/lib/timezone.ts";
import { calculateLoyaltyTier, mergeWithDefaultTiers, nextLoyaltyTier } from "../../src/lib/loyalty/tiers.ts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("período digitado vai do começo do primeiro dia ao fim do último, em São Paulo", () => {
  assert.deepEqual(customRangeSaoPaulo("2026-11-08", "2026-11-08"), {
    from: "2026-11-08T03:00:00.000Z",
    to: "2026-11-09T02:59:59.999Z",
  });
});

test("data inválida ou vazia não vira filtro", () => {
  assert.deepEqual(customRangeSaoPaulo("abc", ""), { from: null, to: null });
  assert.deepEqual(customRangeSaoPaulo(undefined, "def"), { from: null, to: null });
});

test("ranking e vendas usam o mesmo período digitado", () => {
  assert.match(read("src/lib/customers/ranking.ts"), /customRangeSaoPaulo\(from, to\)/);
  assert.match(read("src/lib/sales/queries.ts"), /return customRangeSaoPaulo\(from, to\);/);
});

const names = (result) => result.tiers.map((tier) => `${tier.name}:${tier.minLifetimePoints}`);

test("editar um nível padrão grava os quatro", () => {
  assert.deepEqual(names(mergeWithDefaultTiers({ name: "Prata", minLifetimePoints: 600 }, "Prata")), [
    "Bronze:0", "Prata:600", "Ouro:2000", "Platinum:5000",
  ]);
});

test("renomear um nível padrão troca só ele", () => {
  assert.deepEqual(names(mergeWithDefaultTiers({ name: "Cobre", minLifetimePoints: 0 }, "Bronze")), [
    "Cobre:0", "Prata:500", "Ouro:2000", "Platinum:5000",
  ]);
});

test("nível novo entra junto dos padrões; mesmo nome substitui", () => {
  assert.equal(names(mergeWithDefaultTiers({ name: "Diamante", minLifetimePoints: 10000 })).length, 5);
  assert.deepEqual(names(mergeWithDefaultTiers({ name: "prata", minLifetimePoints: 700 })), [
    "Bronze:0", "prata:700", "Ouro:2000", "Platinum:5000",
  ]);
});

test("edição que repete nome ou pontos de outro nível é recusada", () => {
  assert.match(mergeWithDefaultTiers({ name: "Ouro", minLifetimePoints: 700 }, "Prata").error, /nome/);
  assert.match(mergeWithDefaultTiers({ name: "Prata", minLifetimePoints: 2000 }, "Prata").error, /pontos/);
});

test("abaixo do primeiro limite o cliente não tem nível", () => {
  const only = [{ name: "Prata", minLifetimePoints: 500, sortOrder: 0 }];
  assert.equal(calculateLoyaltyTier(0, only), null);
  assert.equal(calculateLoyaltyTier(500, only)?.name, "Prata");
  assert.equal(nextLoyaltyTier(0, only)?.pointsRemaining, 500);
});

test("migração: cancel_sale não lança mais no caixa e tem script de volta", () => {
  const up = read("supabase/migrations/20261126100000_bateria_criticos_altos.sql");
  const cancel = up.slice(up.indexOf("FUNCTION public.cancel_sale"), up.indexOf("FUNCTION public.grant_loyalty_points_for_sale"));
  assert.doesNotMatch(cancel, /insert into public\.cash_movements/);
  for (const fn of ["remove_draft_sale_payment", "discard_draft_sale", "hr_reverse_advance"]) {
    assert.match(up, new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from public, anon;`));
  }
  assert.match(read("supabase/rollback/20261126100000_bateria_criticos_altos.down.sql"), /drop function if exists public\.hr_reverse_advance/);
});
