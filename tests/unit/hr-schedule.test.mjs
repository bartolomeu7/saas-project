import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  diffDays,
  dueState,
  formatDays,
  hasBirthdayInMonth,
  nextPayday,
  paydayLabel,
  suggestPeriod,
  weekdayOf,
} from "../../src/lib/hr/schedule.ts";

test("datas: soma de dias atravessa mês e ano, e dia da semana confere", () => {
  assert.equal(addDays("2026-11-08", 1), "2026-11-09");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(weekdayOf("2026-11-08"), 0); // domingo
  assert.equal(weekdayOf("2026-11-13"), 5); // sexta
  assert.equal(diffDays("2026-11-01", "2026-11-08"), 7);
});

test("semanal: próxima sexta em ou depois da data (hoje conta)", () => {
  const friday = { pay_frequency: "weekly", pay_weekday: 5, pay_day_of_month: null };
  assert.equal(nextPayday(friday, "2026-11-08"), "2026-11-13"); // domingo -> sexta
  assert.equal(nextPayday(friday, "2026-11-13"), "2026-11-13"); // sexta -> hoje
  assert.equal(nextPayday(friday, "2026-11-14"), "2026-11-20"); // sábado -> próxima sexta
});

test("mensal: dia 5; dia 31 cai no último dia dos meses curtos; vira o ano", () => {
  const day5 = { pay_frequency: "monthly", pay_weekday: null, pay_day_of_month: 5 };
  assert.equal(nextPayday(day5, "2026-11-05"), "2026-11-05");
  assert.equal(nextPayday(day5, "2026-11-06"), "2026-12-05");
  assert.equal(nextPayday(day5, "2026-12-20"), "2027-01-05");
  const day31 = { pay_frequency: "monthly", pay_weekday: null, pay_day_of_month: 31 };
  assert.equal(nextPayday(day31, "2027-02-10"), "2027-02-28");
  assert.equal(nextPayday(day31, "2028-02-10"), "2028-02-29");
  assert.equal(nextPayday(day31, "2026-04-10"), "2026-04-30");
});

test("quinzenal: dia X e X+15 (5 e 20)", () => {
  const s = { pay_frequency: "biweekly", pay_weekday: null, pay_day_of_month: 5 };
  assert.equal(nextPayday(s, "2026-11-01"), "2026-11-05");
  assert.equal(nextPayday(s, "2026-11-06"), "2026-11-20");
  assert.equal(nextPayday(s, "2026-11-21"), "2026-12-05");
  const fifteen = { pay_frequency: "biweekly", pay_weekday: null, pay_day_of_month: 15 };
  assert.equal(nextPayday(fifteen, "2027-02-16"), "2027-02-28"); // 15+15=30 -> fim de fevereiro
});

test("diário: paga no próprio dia", () => {
  assert.equal(nextPayday({ pay_frequency: "daily", pay_weekday: null, pay_day_of_month: null }, "2026-11-08"), "2026-11-08");
});

test("rótulos dos dias de pagamento", () => {
  assert.equal(paydayLabel({ pay_frequency: "weekly", pay_weekday: 5, pay_day_of_month: null }), "Toda sexta-feira");
  assert.equal(paydayLabel({ pay_frequency: "weekly", pay_weekday: 6, pay_day_of_month: null }), "Todo sábado");
  assert.equal(paydayLabel({ pay_frequency: "weekly", pay_weekday: 0, pay_day_of_month: null }), "Todo domingo");
  assert.equal(paydayLabel({ pay_frequency: "monthly", pay_weekday: null, pay_day_of_month: 5 }), "Todo dia 5");
  assert.equal(paydayLabel({ pay_frequency: "biweekly", pay_weekday: null, pay_day_of_month: 5 }), "Dias 5 e 20");
});

test("sugestão de período: depois do último fechado, ou do primeiro dia sem pagamento, ou 7 dias até hoje", () => {
  assert.deepEqual(suggestPeriod({ lastClosedEnd: "2026-11-01", earliestUnsettled: "2026-10-20", today: "2026-11-08" }), { start: "2026-11-02", end: "2026-11-08" });
  assert.deepEqual(suggestPeriod({ lastClosedEnd: null, earliestUnsettled: "2026-11-03", today: "2026-11-08" }), { start: "2026-11-03", end: "2026-11-08" });
  assert.deepEqual(suggestPeriod({ lastClosedEnd: null, earliestUnsettled: null, today: "2026-11-08" }), { start: "2026-11-02", end: "2026-11-08" });
  // último fechado é hoje: o início não passa de hoje
  assert.deepEqual(suggestPeriod({ lastClosedEnd: "2026-11-08", earliestUnsettled: null, today: "2026-11-08" }), { start: "2026-11-08", end: "2026-11-08" });
});

test("atraso, aniversário e formatação de dias", () => {
  assert.equal(dueState("2026-11-07", "2026-11-08"), "overdue");
  assert.equal(dueState("2026-11-08", "2026-11-08"), "today");
  assert.equal(dueState("2026-11-09", "2026-11-08"), "upcoming");
  assert.equal(hasBirthdayInMonth("1990-11-20", "2026-11-08"), true);
  assert.equal(hasBirthdayInMonth("1990-05-20", "2026-11-08"), false);
  assert.equal(hasBirthdayInMonth(null, "2026-11-08"), false);
  assert.equal(formatDays(2.5), "2,5");
  assert.equal(formatDays(3), "3");
});

test("o módulo não depende de nada fora dele (testável sem alias)", async () => {
  const { readFileSync } = await import("node:fs");
  assert.ok(!/^\s*import\s/m.test(readFileSync("src/lib/hr/schedule.ts", "utf8")));
});
