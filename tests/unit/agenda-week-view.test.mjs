import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  addDaysToDateString,
  appointmentVisualState,
  dayKeyOf,
  getWeekBounds,
  hourOf,
  hourRangeFor,
  resolveWeekKey,
  timeLabel,
  weekStartSunday,
  weekdayShort,
} from "../../src/lib/agenda/week-view.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

// 08/11/2026 é domingo: abre a semana atual (Dom 08/11 a Sáb 14/11).
test("a semana vai de domingo a sábado e hoje (domingo 08/11) abre a semana atual", () => {
  assert.equal(weekStartSunday("2026-11-08"), "2026-11-08");
  assert.equal(weekStartSunday("2026-11-11"), "2026-11-08");
  assert.equal(weekStartSunday("2026-11-14"), "2026-11-08");
  assert.equal(weekStartSunday("2026-11-15"), "2026-11-15");
  assert.equal(weekdayShort("2026-11-08"), "Dom");
});

test("três semanas relativas a hoje: passada, atual e próxima", () => {
  const passada = getWeekBounds("passada", "2026-11-08");
  const atual = getWeekBounds("atual", "2026-11-08");
  const proxima = getWeekBounds("proxima", "2026-11-08");
  assert.deepEqual([passada.start, passada.end], ["2026-11-01", "2026-11-07"]);
  assert.deepEqual([atual.start, atual.end], ["2026-11-08", "2026-11-14"]);
  assert.deepEqual([proxima.start, proxima.end], ["2026-11-15", "2026-11-21"]);
  assert.equal(atual.days.length, 7);
  assert.equal(atual.days[0], "2026-11-08");
  assert.equal(atual.days[6], "2026-11-14");
});

test("os limites da consulta são o dia inteiro em São Paulo (UTC-3)", () => {
  const atual = getWeekBounds("atual", "2026-11-08");
  assert.equal(atual.fromIso, "2026-11-08T03:00:00.000Z");
  assert.equal(atual.toIso, "2026-11-15T02:59:59.999Z");
});

test("a semana vira de mês e de ano sem erro", () => {
  assert.equal(addDaysToDateString("2026-12-31", 1), "2027-01-01");
  const atual = getWeekBounds("atual", "2026-12-30");
  assert.equal(atual.start, "2026-12-27");
  assert.equal(atual.end, "2027-01-02");
});

test("semana desconhecida cai na semana atual", () => {
  assert.equal(resolveWeekKey(undefined), "atual");
  assert.equal(resolveWeekKey("xyz"), "atual");
  assert.equal(resolveWeekKey("passada"), "passada");
  assert.equal(resolveWeekKey("proxima"), "proxima");
});

const NOW = new Date("2026-11-08T15:00:00Z"); // 12:00 em São Paulo

test("verde = concluído, branco = passou e não foi concluído, azul = por vir", () => {
  assert.equal(appointmentVisualState({ status: "completed", ends_at: "2026-11-08T13:00:00Z" }, NOW), "done");
  assert.equal(appointmentVisualState({ status: "completed", ends_at: "2026-11-20T13:00:00Z" }, NOW), "done");
  assert.equal(appointmentVisualState({ status: "scheduled", ends_at: "2026-11-08T13:00:00Z" }, NOW), "pending");
  assert.equal(appointmentVisualState({ status: "confirmed", ends_at: "2026-11-01T13:00:00Z" }, NOW), "pending");
  assert.equal(appointmentVisualState({ status: "scheduled", ends_at: "2026-11-08T18:00:00Z" }, NOW), "upcoming");
  assert.equal(appointmentVisualState({ status: "confirmed", ends_at: "2026-11-15T18:00:00Z" }, NOW), "upcoming");
  assert.equal(appointmentVisualState({ status: "cancelled", ends_at: "2026-11-15T18:00:00Z" }, NOW), "cancelled");
  assert.equal(appointmentVisualState({ status: "no_show", ends_at: "2026-11-01T18:00:00Z" }, NOW), "no_show");
});

test("horário e dia exibidos são os de São Paulo, não UTC", () => {
  // 21:30 em São Paulo = 00:30 UTC do dia seguinte
  assert.equal(dayKeyOf("2026-11-09T00:30:00Z"), "2026-11-08");
  assert.equal(hourOf("2026-11-09T00:30:00Z"), 21);
  assert.equal(timeLabel("2026-11-09T00:30:00Z"), "21:30");
  assert.equal(timeLabel("2026-11-09T11:00:00Z"), "08:00");
});

test("a grade mostra 8h–18h e se amplia para atendimentos fora disso", () => {
  assert.deepEqual(hourRangeFor([]), { first: 8, last: 18 });
  assert.deepEqual(hourRangeFor(["2026-11-09T12:00:00Z"]), { first: 8, last: 18 });
  assert.deepEqual(hourRangeFor(["2026-11-09T09:00:00Z", "2026-11-10T01:00:00Z"]), { first: 6, last: 22 });
});

test("a página usa a agenda em 3 semanas com consulta por período e cores pedidas", () => {
  const page = read("src/app/(app)/app/agenda/page.tsx");
  assert.ok(page.includes("AgendaWeekCalendar") && page.includes("listAppointmentsBetween"));
  assert.ok(page.includes('semana'));
  const calendar = read("src/components/app/agenda-week-calendar.tsx");
  assert.ok(calendar.includes("bg-emerald") && calendar.includes("bg-white") && calendar.includes("bg-sky"));
  assert.ok(calendar.includes("CompleteAppointmentForm"), "concluir passa pelo formulário que gera a venda");
});
