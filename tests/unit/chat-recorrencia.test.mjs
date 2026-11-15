import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { parseRecurrence, expandRecurrence, parseLimitAnswer, describeRecurrence, MAX_OCCURRENCES } from "../../src/lib/chat/recurrence-pt.ts";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";
import { CLOCK, CATALOG, PORTS } from "../chat-bateria/fixture-teste1.mjs";

const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const dayOf = (d) => Number(d.slice(8, 10));

// ------------------------------------------------------------------ interpretação
test("ritmo e limite em português", () => {
  const cases = [
    ["toda terça por 8 semanas", { freq: "weekly", interval: 1, weekday: 2 }, { n: 8, unit: "semanas" }],
    ["toda semana 6 vezes", { freq: "weekly", interval: 1 }, { n: 6, unit: "vezes" }],
    ["todo dia 5 por 3 meses", { freq: "monthly", interval: 1, monthday: 5 }, { n: 3, unit: "meses" }],
    ["a cada 15 dias 4 vezes", { freq: "daily", interval: 15 }, { n: 4, unit: "vezes" }],
    ["quinzenal por dois meses", { freq: "weekly", interval: 2 }, { n: 2, unit: "meses" }],
    ["de 7 em 7 dias por quatro semanas", { freq: "daily", interval: 7 }, { n: 4, unit: "semanas" }],
    ["todas as quintas durante oito semanas", { freq: "weekly", interval: 1, weekday: 4 }, { n: 8, unit: "semanas" }],
    ["mensal por seis meses", { freq: "monthly", interval: 1 }, { n: 6, unit: "meses" }],
    ["todos os dias por uma semana", { freq: "daily", interval: 1 }, { n: 1, unit: "semanas" }],
  ];
  for (const [text, base, limit] of cases) {
    const r = parseRecurrence(text);
    assert.ok(r, text);
    for (const [k, v] of Object.entries(base)) assert.equal(r[k], v, `${text}: ${k}`);
    assert.deepEqual(r.limit, limit, text);
  }
});

test("frases sem repetição não viram recorrência", () => {
  for (const t of ["agendar corte amanhã às 10h", "toda hora que eu preciso", "quero uma vez só", "dia 5 às 10h", "valor 80 reais"]) assert.equal(parseRecurrence(t), null, t);
});

test("resposta a 'por quantas vezes?'", () => {
  assert.deepEqual(parseLimitAnswer("8"), { n: 8, unit: "vezes" });
  assert.deepEqual(parseLimitAnswer("8 vezes"), { n: 8, unit: "vezes" });
  assert.deepEqual(parseLimitAnswer("por 3 meses"), { n: 3, unit: "meses" });
  assert.deepEqual(parseLimitAnswer("oito"), { n: 8, unit: "vezes" });
  assert.equal(parseLimitAnswer("não sei"), null);
  assert.equal(parseLimitAnswer("0"), null);
});

// ------------------------------------------------------------------ expansão (propriedades)
test("propriedade: a série começa na data pedida, é crescente, sem repetição e nunca passa de 12", () => {
  const freqs = fc.constantFrom("weekly", "monthly", "daily");
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 400 }), freqs, fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 40 }), (offset, freq, interval, count) => {
      const start = new Date(Date.UTC(2026, 10, 16 + offset)).toISOString().slice(0, 10);
      const { dates } = expandRecurrence(start, { freq, interval, limit: { n: count, unit: "vezes" } });
      const sorted = [...dates].sort();
      return dates[0] === start && JSON.stringify(sorted) === JSON.stringify(dates) && new Set(dates).size === dates.length && dates.length <= MAX_OCCURRENCES && dates.length === Math.min(count, MAX_OCCURRENCES);
    }),
    { numRuns: 300, seed: 20261115 }
  );
});

test("propriedade: semanal cai sempre no mesmo dia da semana e com o espaço pedido; mensal no mesmo dia do mês", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 2, max: 12 }), (offset, interval, count) => {
      const start = new Date(Date.UTC(2026, 10, 16 + offset)).toISOString().slice(0, 10);
      const w = expandRecurrence(start, { freq: "weekly", interval, limit: { n: count, unit: "vezes" } }).dates;
      const okWeekly = w.every((d, i) => weekday(d) === weekday(start) && (i === 0 || (new Date(d) - new Date(w[i - 1])) / 86_400_000 === 7 * interval));
      const m = expandRecurrence(start, { freq: "monthly", interval: 1, monthday: Math.min(dayOf(start), 28), limit: { n: count, unit: "vezes" } }).dates;
      const okMonthly = m.slice(1).every((d) => dayOf(d) === Math.min(dayOf(start), 28));
      return okWeekly && okMonthly;
    }),
    { numRuns: 200, seed: 20261115 }
  );
});

test("propriedade: 'por N semanas' semanal dá ceil(N/intervalo) datas; diário por 1 semana cobre 7 dias", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 3 }), (n, interval) => {
      const a = expandRecurrence("2026-11-16", { freq: "weekly", interval, limit: { n, unit: "semanas" } }).dates;
      const b = expandRecurrence("2026-11-16", { freq: "daily", interval: 1, limit: { n: 1, unit: "semanas" } }).dates;
      return a.length === Math.min(Math.ceil(n / interval), MAX_OCCURRENCES) && b.length === 7;
    }),
    { numRuns: 150, seed: 20261115 }
  );
});

test("mais de 12 é cortado em 12 e marca que cortou", () => {
  const r = expandRecurrence("2026-11-16", { freq: "weekly", interval: 1, limit: { n: 30, unit: "semanas" } });
  assert.equal(r.dates.length, 12);
  assert.equal(r.capped, true);
});

test("descrição para o resumo", () => {
  assert.equal(describeRecurrence({ freq: "weekly", interval: 1, weekday: 2 }), "toda terça");
  assert.equal(describeRecurrence({ freq: "weekly", interval: 2 }), "a cada 2 semanas");
  assert.equal(describeRecurrence({ freq: "monthly", interval: 1, monthday: 5 }), "todo dia 5");
});

// ------------------------------------------------------------------ no motor de conversa
const run = async (turns, clock = CLOCK, ports = PORTS) => {
  let state = emptyState();
  let r;
  for (const t of turns) {
    r = await runAgendarTurn({ text: t, state: JSON.parse(JSON.stringify(state)), catalog: CATALOG, clock }, ports);
    state = r.state;
  }
  return r;
};
const card = (r) => r.messages.find((m) => m.kind === "confirm")?.card;
const field = (r, label) => card(r)?.fields.find((f) => f.label === label);

test("'toda terça às 10h por 4 semanas': resumo com as 4 datas e o título no plural", async () => {
  const r = await run(["agendar corte para João Pedro com a Ana toda terça às 10h por 4 semanas"]);
  assert.equal(card(r).title, "Novos agendamentos (4)");
  assert.equal(field(r, "Datas").value, "ter 17/11, ter 24/11, ter 01/12, ter 08/12");
  assert.match(field(r, "Repete").value, /toda terça · 4 agendamentos/);
  assert.deepEqual(r.state.slots.datas, ["2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"]);
});

test("sem dizer por quanto tempo: pergunta 'por quantas vezes' e a resposta fecha o resumo", async () => {
  let r = await run(["agendar corte para João Pedro com a Ana toda quinta às 14h"]);
  assert.ok(r.messages.some((m) => m.kind === "ask" && /Por quantas vezes/.test(m.text)));
  assert.equal(card(r), undefined);
  r = await run(["agendar corte para João Pedro com a Ana toda quinta às 14h", "8 vezes"]);
  assert.equal(r.state.slots.datas.length, 8);
});

test("datas com conflito são PULADAS e avisadas; as demais seguem", async () => {
  // primeira data ocupada (terça 17/11 às 10h com o Rafael, fixture): tratamento normal, nada montado
  const r = await run(["agendar barba para João Pedro com o Rafael toda terça às 10h por 3 semanas"]);
  assert.equal(card(r), undefined);
  const ok = await run(["agendar barba para João Pedro com o Rafael toda quarta às 10h por 3 semanas"]);
  assert.deepEqual(ok.state.slots.datas, ["2026-11-18", "2026-11-25", "2026-12-02"]);
  const blocked = {
    ...PORTS,
    loadSchedule: async (pid, date) => {
      const base = await PORTS.loadSchedule(pid, date);
      return date === "2026-11-25" ? { ...base, busy: [...base.busy, { start: "2026-11-25T10:00", end: "2026-11-25T10:30" }] } : base;
    },
  };
  const r2 = await run(["agendar barba para João Pedro com o Rafael toda quarta às 10h por 3 semanas"], CLOCK, blocked);
  assert.deepEqual(r2.state.slots.datas, ["2026-11-18", "2026-12-02"]);
  assert.deepEqual(r2.state.slots.puladas, [{ date: "2026-11-25", motivo: "horário ocupado" }]);
  assert.match(field(r2, "Repete").note, /pulei 1: 25\/11 \(horário ocupado\)/);
});

test("feriado numa data da série aparece como aviso no resumo (e não bloqueia)", async () => {
  const r = await run(["agendar barba para João Pedro com a Ana toda sexta às 10h por 4 semanas"], { today: "2026-11-15", nowMinutes: 9 * 60 });
  assert.ok(card(r).warnings.some((w) => /20\/11\/2026 é feriado nacional \(Dia da Consciência Negra\)/.test(w)));
  assert.ok(r.state.slots.datas.includes("2026-11-20"));
});

test("'só uma vez' desfaz a repetição e o resumo volta a ser de um agendamento", async () => {
  const r = await run(["agendar corte para João Pedro com a Ana toda terça às 10h por 4 semanas", "só uma vez"]);
  assert.equal(card(r).title, "Novo agendamento");
  assert.equal(r.state.slots.recorrencia, undefined);
});

test("série cortada em 12 avisa", async () => {
  const r = await run(["agendar barba para João Pedro com a Ana toda terça às 10h por 30 semanas"]);
  assert.equal(r.state.slots.datas.length <= 12, true);
  assert.ok(r.messages.some((m) => /Limitei em 12/.test(m.text ?? "")));
});

test("propriedade (motor): em qualquer combinação, a série só tem datas conferidas e a primeira é a pedida", async () => {
  const freqs = fc.constantFrom("toda segunda", "toda terça", "toda quarta", "toda sexta", "toda semana", "quinzenal", "todo dia 10");
  const lens = fc.constantFrom("por 3 semanas", "4 vezes", "por 2 meses", "6 vezes", "por 20 semanas");
  await fc.assert(
    fc.asyncProperty(freqs, lens, async (f, l) => {
      const r = await run([`agendar barba para João Pedro com a Ana ${f} às 10h ${l}`], { today: "2026-11-15", nowMinutes: 9 * 60 });
      const kinds = r.messages.map((m) => m.kind);
      if (!kinds.includes("confirm")) return kinds.includes("ask") || kinds.includes("disambiguate") || kinds.includes("notice");
      const d = r.state.slots.datas ?? [r.state.slots.date];
      return d[0] === r.state.slots.date && d.length <= 12 && new Set(d).size === d.length;
    }),
    { numRuns: 120, seed: 20261115 }
  );
});

// ------------------------------------------------------------------ rota de confirmação (guardas)
const confirmSrc = readFileSync("src/app/(app)/app/chat/confirm/route.ts", "utf8");
test("confirmar: grava a série na ordem, para na primeira falha e conta exatamente o que criou", () => {
  assert.ok(confirmSrc.includes("recheck.state.slots.datas"), "usa as datas JÁ revalidadas agora, não as do rascunho antigo");
  assert.ok(confirmSrc.includes("for (const date of dates)") && confirmSrc.includes("break; // não tenta as próximas"));
  assert.ok(confirmSrc.includes('status: failure ? "parcial" : "concluido"'));
  assert.ok(confirmSrc.includes("Criei ${createdIds.length} de ${dates.length}"));
  assert.ok(confirmSrc.includes("datesChanged"), "datas da série mudaram desde o resumo → pede nova conferência, não grava");
  assert.ok(confirmSrc.includes("createdId = createdIds[0]"), "depois do primeiro criado, nada libera o rascunho");
});
