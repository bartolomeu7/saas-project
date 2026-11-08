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
  assert.match(page, /view === "semana"\s*\?\s*listAppointmentsBetween\(current\.company\.id, week\.fromIso, week\.toIso/);
  assert.ok(page.includes('appointments={view === "dia" ? appointments : calendarAppointments}'));
  // navegar entre dias/semanas/profissionais mantém a visão escolhida
  assert.ok(page.includes('if (visao !== "semana") params.set("visao", visao)'));
});

import {
  addMonthsToDateString,
  dateRangeIso,
  matchesSearch,
  monthGrid,
  monthLabel,
  normalizeSearch,
} from "../../src/lib/agenda/week-view.ts";

test("rótulo do mês em português", () => {
  assert.equal(monthLabel("2026-11-08"), "Novembro de 2026");
  assert.equal(monthLabel("2027-03-01"), "Março de 2027");
});

test("somar meses mantém o dia e nunca estoura o mês (31/01 + 1 = 28/02)", () => {
  assert.equal(addMonthsToDateString("2026-11-08", 1), "2026-12-08");
  assert.equal(addMonthsToDateString("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonthsToDateString("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsToDateString("2028-01-31", 1), "2028-02-29", "ano bissexto");
  assert.equal(addMonthsToDateString("2026-01-10", -1), "2025-12-10");
});

test("grade do mês: semanas inteiras de domingo a sábado (28, 35 ou 42 dias)", () => {
  // novembro/2026: dia 1 é domingo e dia 30 é segunda → 5 semanas
  const nov = monthGrid("2026-11-18");
  assert.deepEqual([nov.monthStart, nov.monthEnd, nov.gridStart, nov.gridEnd], ["2026-11-01", "2026-11-30", "2026-11-01", "2026-12-05"]);
  assert.equal(nov.days.length, 35);
  // fevereiro/2026: começa no domingo e termina no sábado → exatamente 4 semanas
  assert.equal(monthGrid("2026-02-10").days.length, 28);
  // agosto/2026: dia 1 é sábado e dia 31 é segunda → 6 semanas
  const ago = monthGrid("2026-08-15");
  assert.equal(ago.days.length, 42);
  assert.equal(ago.gridStart, "2026-07-26");
  assert.equal(ago.gridEnd, "2026-09-05");
  for (const grid of [nov, ago]) {
    assert.equal(grid.days.length % 7, 0);
    assert.equal(grid.days[0], grid.gridStart);
    assert.equal(grid.days.at(-1), grid.gridEnd);
  }
});

test("limites da consulta do mês: do começo do primeiro dia ao fim do último, em São Paulo", () => {
  const { gridStart, gridEnd } = monthGrid("2026-11-18");
  assert.deepEqual(dateRangeIso(gridStart, gridEnd), { fromIso: "2026-11-01T03:00:00.000Z", toIso: "2026-12-06T02:59:59.999Z" });
});

test("busca sem acento, sem diferença de maiúscula, e todas as palavras precisam aparecer", () => {
  const item = { customer_name: "João da Silva", service_name: "Escova Progressiva", professional_name: "Larissa", notes: "alergia a amônia" };
  assert.equal(normalizeSearch("  JOÃO  "), "joao");
  assert.equal(matchesSearch(item, "joao"), true);
  assert.equal(matchesSearch(item, "escova silva"), true);
  assert.equal(matchesSearch(item, "larissa"), true);
  assert.equal(matchesSearch(item, "amonia"), true, "acha na observação");
  assert.equal(matchesSearch(item, "joao pedro"), false, "uma palavra faltando");
  assert.equal(matchesSearch(item, "   "), true, "busca vazia mostra tudo");
  assert.equal(matchesSearch({ service_name: "Corte" }, "maria"), false);
});

test("visão de mês, busca e impressão do dia estão ligadas na agenda", () => {
  const page = read("src/app/(app)/app/agenda/page.tsx");
  assert.ok(page.includes('"mes"') && page.includes("Mês anterior") && page.includes("Próximo mês"));
  assert.ok(page.includes("monthGrid(date)") && page.includes("monthRange"), "consulta o mês inteiro (semanas completas)");
  assert.ok(page.includes("/app/agenda/imprimir?date="), "link Imprimir o dia");
  const calendar = read("src/components/app/agenda-week-calendar.tsx");
  assert.ok(calendar.includes("<MonthGrid") && calendar.includes("matchesSearch("));
  // a busca só filtra o que se vê: o painel do atendimento continua achando pelo conjunto completo
  assert.ok(calendar.includes("appointments.find((row) => row.id === selectedId)"));
  const month = read("src/components/app/agenda-month-grid.tsx");
  assert.ok(month.includes("+{hidden} mais") && month.includes("md:hidden"), "no celular o mês vira bolinhas");
});

test("impressão: folha própria que é a única coisa visível ao imprimir, com totais e sem cancelados no valor previsto", () => {
  const print = read("src/app/(app)/app/agenda/imprimir/page.tsx");
  assert.ok(print.includes("@media print") && print.includes("body * { visibility: hidden"), "esconde o resto do sistema ao imprimir");
  assert.ok(print.includes("no-print") && print.includes('row.status !== "cancelled" && row.status !== "no_show"'));
  assert.ok(print.includes("getCurrentCompany()"), "continua dentro da área logada, com a empresa do usuário");
  assert.ok(read("src/components/app/agenda-print-actions.tsx").includes("window.print()"));
  assert.ok(read("src/lib/agenda/queries.ts").includes("customers(name,phone)"), "telefone do cliente na folha");
});
