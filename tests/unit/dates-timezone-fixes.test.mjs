import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseLocalDateTimeSaoPaulo, todayDateSaoPaulo } from "../../src/lib/timezone.ts";
import { formatDate } from "../../src/lib/format.ts";
import { parseMoneyInput } from "../../src/lib/parse-money.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Bug real (rodada de uso 08/11/2026): digitar 18:00 na agenda gravava 18:00 UTC (= 15:00 em São Paulo).
test("horário digitado é horário de São Paulo (UTC-3), não UTC", () => {
  assert.equal(parseLocalDateTimeSaoPaulo("2026-11-09T18:00")?.toISOString(), "2026-11-09T21:00:00.000Z");
  assert.equal(parseLocalDateTimeSaoPaulo("2026-11-09T09:00")?.toISOString(), "2026-11-09T12:00:00.000Z");
  assert.equal(parseLocalDateTimeSaoPaulo("2026-11-09T23:30")?.toISOString(), "2026-11-10T02:30:00.000Z");
  assert.equal(parseLocalDateTimeSaoPaulo("2026-11-09T14:30:15")?.toISOString(), "2026-11-09T17:30:15.000Z");
});

test("horário inválido vira null (não uma data corrigida em silêncio)", () => {
  for (const bad of ["", "abc", "2026-13-01T10:00", "2026-02-31T10:00", "2026-11-09T25:00", "2026-11-09", "2026-11-09T10:61"]) {
    assert.equal(parseLocalDateTimeSaoPaulo(bad), null, bad);
  }
});

test("hoje em São Paulo: após 21h o UTC já virou o dia, mas a data continua a de São Paulo", () => {
  assert.equal(todayDateSaoPaulo(new Date("2026-11-09T02:30:00Z")), "2026-11-08");
  assert.equal(todayDateSaoPaulo(new Date("2026-11-08T03:00:00Z")), "2026-11-08");
  assert.equal(todayDateSaoPaulo(new Date("2026-11-08T02:59:59Z")), "2026-11-07");
  assert.equal(todayDateSaoPaulo(new Date("2026-01-01T02:00:00Z")), "2025-12-31");
});

test("data sem hora (aniversário) não perde um dia", () => {
  assert.equal(formatDate("1991-09-22"), "22/09/1991");
  assert.equal(formatDate("2026-03-14"), "14/03/2026");
});

test("instante com hora continua convertido para o dia de São Paulo", () => {
  assert.equal(formatDate("2026-11-08T02:00:00Z"), "07/11/2026");
  assert.equal(formatDate("2026-11-08T12:00:00Z"), "08/11/2026");
});

test("preço com vírgula é aceito (era erro cru do banco)", () => {
  assert.equal(parseMoneyInput("280,00"), 280);
  assert.equal(parseMoneyInput("1.280,50"), 1280.5);
  assert.equal(parseMoneyInput("280.5"), 280.5);
  assert.equal(parseMoneyInput(" 45 "), 45);
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput(undefined), null);
  assert.equal(parseMoneyInput("abc"), null);
  assert.equal(parseMoneyInput("-5"), null);
});

test("agenda e bloqueio usam o parser de São Paulo, nunca new Date(texto)", () => {
  for (const file of ["src/lib/agenda/actions.ts", "src/lib/team/actions.ts"]) {
    const src = read(file);
    assert.ok(src.includes("parseLocalDateTimeSaoPaulo"), `${file} não usa o parser`);
    assert.ok(!/new Date\((startsAt|endsAt)\)/.test(src), `${file} ainda usa new Date(startsAt/endsAt)`);
  }
});

test("datas 'de hoje' de negócio não usam toISOString (UTC)", () => {
  for (const file of [
    "src/lib/finance/actions.ts",
    "src/lib/finance/queries.ts",
    "src/lib/reports/queries.ts",
    "src/components/app/finance-action-forms.tsx",
  ]) {
    assert.ok(!/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(read(file)), `${file} usa a data UTC como "hoje"`);
  }
});

test("histórico mostra textos em português (sem chave crua)", () => {
  assert.ok(read("src/components/app/product-history-list.tsx").includes("product_stock_adjusted"));
  const sale = read("src/components/app/sale-history-list.tsx");
  assert.ok(sale.includes("PAYMENT_METHOD_LABELS") && sale.includes('style: "currency"'));
});
