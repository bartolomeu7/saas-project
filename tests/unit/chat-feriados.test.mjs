import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fc from "fast-check";
import { easterSunday, holidaysBr, holidayOn, holidayWarning } from "../../src/lib/chat/holidays-br.ts";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";
import { CATALOG, PORTS } from "../chat-bateria/fixture-teste1.mjs";

const require = createRequire(import.meta.url);
const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();

test("Páscoa: datas conhecidas", () => {
  const known = { 2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28", 2030: "2030-04-21" };
  for (const [y, d] of Object.entries(known)) assert.equal(easterSunday(Number(y)), d, y);
});

test("propriedade: a Páscoa cai sempre num domingo (2000–2100), entre 22/03 e 25/04", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2000, max: 2100 }), (y) => {
      const e = easterSunday(y);
      return weekday(e) === 0 && e >= `${y}-03-22` && e <= `${y}-04-25`;
    }),
    { numRuns: 101, seed: 20261115 }
  );
});

test("propriedade: Sexta-feira Santa é sexta, Carnaval é segunda/terça, Corpus Christi é quinta (2000–2100)", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2000, max: 2100 }), (y) => {
      const list = holidaysBr(y);
      const by = (n) => list.find((h) => h.name.startsWith(n)).date;
      return weekday(by("Sexta-feira Santa")) === 5 && weekday(by("Carnaval (segunda")) === 1 && weekday(by("Carnaval (terça")) === 2 && weekday(by("Corpus Christi")) === 4;
    }),
    { numRuns: 101, seed: 20261115 }
  );
});

test("lista do ano: ordenada, sem datas repetidas, todas dentro do ano; Consciência Negra só a partir de 2024", () => {
  for (const y of [2023, 2024, 2026, 2030]) {
    const l = holidaysBr(y);
    assert.deepEqual(l.map((h) => h.date), [...l.map((h) => h.date)].sort());
    assert.equal(new Set(l.map((h) => h.date)).size, l.length);
    assert.ok(l.every((h) => h.date.startsWith(`${y}-`)));
  }
  assert.ok(!holidayOn("2023-11-20"));
  assert.equal(holidayOn("2024-11-20")?.name, "Dia da Consciência Negra");
});

test("JUIZ date-holidays: os feriados NACIONAIS de 2024 a 2030 batem com a biblioteca (ela também lista as eleições, que não entram aqui)", () => {
  const Holidays = require("date-holidays");
  const hd = new Holidays("BR");
  for (let y = 2024; y <= 2030; y++) {
    const ref = hd.getHolidays(y).filter((h) => h.type === "public" && !/Elei/.test(h.name)).map((h) => h.date.slice(0, 10));
    const ours = holidaysBr(y).filter((h) => h.kind === "feriado").map((h) => h.date);
    assert.deepEqual(ours, ref, `ano ${y}`);
  }
});

test("aviso de feriado no resumo do agendamento (sem bloquear)", async () => {
  const clock = { today: "2026-11-15", nowMinutes: 11 * 60 };
  const r = await runAgendarTurn({ text: "agendar teste onda E para Juliana Ferreira dia 20/11 às 15h com Rafael", state: emptyState(), catalog: CATALOG, clock }, PORTS);
  const card = r.messages.find((m) => m.kind === "confirm")?.card;
  assert.ok(card, "ainda monta o resumo");
  assert.ok(card.warnings.some((w) => /feriado nacional \(Dia da Consciência Negra\)/.test(w)));
});

test("consultas mostram o feriado do dia", async () => {
  const clock = { today: "2026-11-15", nowMinutes: 9 * 60 };
  const free = await runAgendarTurn({ text: "quais horários livres dia 20/11?", state: emptyState(), catalog: CATALOG, clock }, PORTS);
  assert.match(free.messages[0].text, /feriado: Dia da Consciência Negra/);
  assert.equal(holidayWarning("2026-12-25", "sexta-feira, 25/12/2026"), "sexta-feira, 25/12/2026 é feriado nacional (Natal). Confirme se a empresa atende nesse dia.");
  assert.equal(holidayWarning("2026-11-11", "x"), null);
});
