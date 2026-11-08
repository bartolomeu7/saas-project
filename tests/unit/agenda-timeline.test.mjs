import test from "node:test";
import assert from "node:assert/strict";
import {
  durationMinutes,
  layoutTimeline,
  minutesOfDay,
  nowInSaoPaulo,
  timelineHourRange,
  timelinePercent,
} from "../../src/lib/agenda/week-view.ts";

// Atendimento no horário de São Paulo (UTC-3) em 09/11/2026.
const at = (hhmm, minutes) => {
  const [h, m] = hhmm.split(":").map(Number);
  const start = new Date(Date.UTC(2026, 10, 9, h + 3, m));
  return { id: hhmm + "+" + minutes, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes * 60000).toISOString() };
};

test("minutos do dia seguem o relógio de São Paulo", () => {
  assert.equal(minutesOfDay(at("08:30", 60).starts_at), 8 * 60 + 30);
  assert.equal(minutesOfDay(at("00:05", 30).starts_at), 5);
  assert.equal(minutesOfDay(at("23:59", 5).starts_at), 23 * 60 + 59);
});

test("a duração nunca é menor que 15 minutos (bloco continua clicável)", () => {
  assert.equal(durationMinutes(at("10:00", 150)), 150);
  assert.equal(durationMinutes(at("10:00", 5)), 15);
});

test("atendimentos que não se sobrepõem ficam em uma faixa só, largura inteira", () => {
  const blocks = layoutTimeline([at("08:00", 60), at("10:00", 60), at("13:00", 90)]);
  assert.deepEqual(blocks.map((b) => [b.lane, b.lanes]), [[0, 1], [0, 1], [0, 1]]);
});

test("atendimentos que apenas se tocam (um termina quando o outro começa) NÃO se sobrepõem", () => {
  const blocks = layoutTimeline([at("08:00", 60), at("09:00", 60)]);
  assert.deepEqual(blocks.map((b) => [b.lane, b.lanes]), [[0, 1], [0, 1]]);
});

test("dois atendimentos no mesmo horário ficam lado a lado (2 faixas)", () => {
  const blocks = layoutTimeline([at("08:00", 60), at("08:00", 60)]);
  assert.deepEqual(blocks.map((b) => [b.lane, b.lanes]), [[0, 2], [1, 2]]);
});

test("sobreposição parcial: o atendimento longo divide a largura com os curtos; depois volta a largura inteira", () => {
  // 08:00–11:00 sobrepõe 09:00–10:00 e 10:00–10:30; o de 12:00 é livre
  const blocks = layoutTimeline([at("08:00", 180), at("09:00", 60), at("10:00", 30), at("12:00", 60)]);
  const byId = Object.fromEntries(blocks.map((b) => [b.item.id, [b.lane, b.lanes]]));
  assert.deepEqual(byId["08:00+180"], [0, 2]);
  assert.deepEqual(byId["09:00+60"], [1, 2]);
  assert.deepEqual(byId["10:00+30"], [1, 2], "reusa a faixa 1, já livre às 10h");
  assert.deepEqual(byId["12:00+60"], [0, 1]);
});

test("três ao mesmo tempo = 3 faixas", () => {
  const blocks = layoutTimeline([at("14:00", 60), at("14:00", 60), at("14:30", 60)]);
  assert.ok(blocks.every((b) => b.lanes === 3));
  assert.deepEqual(blocks.map((b) => b.lane).sort(), [0, 1, 2]);
});

test("entrada fora de ordem dá o mesmo resultado", () => {
  const a = layoutTimeline([at("10:00", 30), at("08:00", 180), at("09:00", 60)]);
  const b = layoutTimeline([at("08:00", 180), at("09:00", 60), at("10:00", 30)]);
  const key = (blocks) => blocks.map((x) => `${x.item.id}:${x.lane}/${x.lanes}`).sort();
  assert.deepEqual(key(a), key(b));
});

test("atendimento que passa da meia-noite é cortado no fim do dia", () => {
  const [block] = layoutTimeline([at("23:00", 120)]);
  assert.equal(block.startMin, 23 * 60);
  assert.equal(block.endMin, 1440);
});

test("faixa de horas: 8h–18h no mínimo; amplia para caber o primeiro e o último atendimento", () => {
  assert.deepEqual(timelineHourRange([]), { first: 8, last: 18 });
  assert.deepEqual(timelineHourRange([at("09:00", 60)]), { first: 8, last: 18 });
  assert.deepEqual(timelineHourRange([at("06:30", 60), at("19:15", 120)]), { first: 6, last: 22 });
  // termina às 18:30 → precisa da hora das 19h inteira
  assert.deepEqual(timelineHourRange([at("17:00", 90)]), { first: 8, last: 19 });
});

test("posição vertical em percentual da grade; fora da faixa não aparece", () => {
  const range = { first: 8, last: 18 };
  assert.equal(timelinePercent(8 * 60, range), 0);
  assert.equal(timelinePercent(13 * 60, range), 50);
  assert.equal(timelinePercent(18 * 60, range), 100);
  assert.equal(timelinePercent(7 * 60, range), null);
  assert.equal(timelinePercent(19 * 60, range), null);
});

test("'agora' em São Paulo: depois das 21h o dia UTC já virou mas o dia e a hora são os de São Paulo", () => {
  assert.deepEqual(nowInSaoPaulo(new Date("2026-11-09T01:30:00Z")), { date: "2026-11-08", minutes: 22 * 60 + 30 });
  assert.deepEqual(nowInSaoPaulo(new Date("2026-11-08T15:00:00Z")), { date: "2026-11-08", minutes: 12 * 60 });
});

import { readFileSync } from "node:fs";
import path from "node:path";
const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

test("a semana atual e a visão Dia usam a grade de horas proporcional (a antiga grade por célula saiu)", () => {
  const calendar = read("src/components/app/agenda-week-calendar.tsx");
  assert.ok(calendar.includes("<TimeGrid"));
  assert.ok(!calendar.includes("function HourGrid") && !calendar.includes("function HourRow"));
  assert.ok(calendar.includes('mode === "day"'), "visão Dia");
  assert.ok(calendar.includes("professionalDotClass") && calendar.includes("Sem profissional"), "colunas por profissional");
  const grid = read("src/components/app/agenda-time-grid.tsx");
  assert.ok(grid.includes("layoutTimeline(") && grid.includes("timelinePercent(") && grid.includes("nowInSaoPaulo("), "posição, sobreposição e linha do agora");
  assert.ok(grid.includes("aria-label"), "blocos legíveis para leitor de tela");
});

test("página: seletor Semana/Dia, a visão Dia usa a lista do dia e só a Semana busca a semana inteira", () => {
  const page = read("src/app/(app)/app/agenda/page.tsx");
  assert.ok(page.includes('"dia"') && page.includes("visao"));
  assert.ok(page.includes('view === "semana" ? listAppointmentsBetween('));
  assert.ok(page.includes('appointments={view === "dia" ? appointments : calendarAppointments}'));
  // navegar entre dias/semanas/profissionais mantém a visão escolhida
  assert.ok(page.includes('if (visao === "dia") params.set("visao", "dia")'));
});
