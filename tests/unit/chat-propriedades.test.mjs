import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { fakerPT_BR as faker } from "@faker-js/faker";
import { parseDateTimePt } from "../../src/lib/chat/datetime-pt.ts";
import { parseExtras } from "../../src/lib/chat/agenda-agendar.ts";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";
import { searchCustomers, customersByPhone } from "../../src/lib/chat/customer-search.ts";
import { parseDecimalPt } from "../../src/lib/chat/numbers-pt.ts";
import { CLOCK, CATALOG, PORTS } from "../chat-bateria/fixture-teste1.mjs";

/**
 * Chat AI — TESTES POR PROPRIEDADE (fast-check): em vez de alguns exemplos, o fast-check inventa centenas de casos e procura o
 * que quebra a regra. Dados fictícios em pt-BR vêm do faker (semente fixa → resultado repetível).
 * Relógio: quarta 11/11/2026 12:58.
 */
const pad = (n) => String(n).padStart(2, "0");
const RUNS = { numRuns: 300, seed: 20261115 };
faker.seed(20261115);

test("hora exata: 'amanhã às H:MM' (7h–23h) devolve exatamente H:MM e o dia seguinte", () => {
  fc.assert(
    fc.property(fc.integer({ min: 7, max: 23 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
      const w = parseDateTimePt(`amanhã às ${h}:${pad(m)}`, CLOCK);
      return w.time?.value === `${pad(h)}:${pad(m)}` && w.date?.value === "2026-11-12";
    }),
    RUNS
  );
});

test("dia do mês: 'dia D às Hh' devolve o dia D e a hora, ou avisa que a data é inválida", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 31 }), fc.integer({ min: 7, max: 22 }), (d, h) => {
      const w = parseDateTimePt(`dia ${d} às ${h}h`, CLOCK);
      return w.problems.length > 0 || (Number(w.date?.value.slice(8, 10)) === d && w.time?.value === `${pad(h)}:00`);
    }),
    RUNS
  );
});

test("'N para as H' é sempre (H-1):(60-N)", () => {
  fc.assert(
    fc.property(fc.integer({ min: 5, max: 55 }), fc.integer({ min: 8, max: 17 }), (n, h) => {
      const w = parseDateTimePt(`amanhã às ${n} para as ${h}`, CLOCK);
      return w.time?.value === `${pad(h - 1)}:${pad(60 - n)}`;
    }),
    RUNS
  );
});

test("'daqui a N dias' soma N dias a hoje (1 a 60)", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 60 }), (n) => {
      const w = parseDateTimePt(`daqui a ${n} dias às 10h`, CLOCK);
      const expected = new Date(Date.UTC(2026, 10, 11 + n)).toISOString().slice(0, 10);
      return w.date?.value === expected && w.time?.value === "10:00";
    }),
    RUNS
  );
});

test("valor: 'valor R$ X' devolve exatamente X (centavos, milhar com ponto, vírgula decimal)", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 99_999_999 }), (cents) => {
      const reais = Math.floor(cents / 100);
      const text = `${reais.toLocaleString("pt-BR")},${pad(cents % 100)}`;
      return parseExtras(`agendar corte valor R$ ${text}`).priceOverride === cents / 100;
    }),
    RUNS
  );
});

test("parseDecimalPt: formatado em pt-BR e lido de volta dá o mesmo número", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 99_999_999 }), (cents) => {
      const value = cents / 100;
      const text = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return parseDecimalPt(text) === value;
    }),
    RUNS
  );
});

test("busca de cliente: o nome completo sempre acha o próprio cliente e nunca devolve quem não está na lista", () => {
  const list = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, name: faker.person.fullName(), phone: faker.phone.number({ style: "national" }) }));
  const ids = new Set(list.map((c) => c.id));
  fc.assert(
    fc.property(fc.integer({ min: 0, max: list.length - 1 }), (i) => {
      const hit = searchCustomers(list, list[i].name);
      return hit.some((h) => h.id === list[i].id) && hit.every((h) => ids.has(h.id));
    }),
    RUNS
  );
});

test("busca de cliente e de telefone: texto qualquer nunca quebra e nunca inventa cliente", () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: faker.person.fullName(), phone: faker.phone.number({ style: "national" }) }));
  const ids = new Set(list.map((c) => c.id));
  fc.assert(
    fc.property(fc.string({ maxLength: 60 }), (s) => searchCustomers(list, s).every((h) => ids.has(h.id)) && customersByPhone(list, s).every((h) => ids.has(h.id))),
    { numRuns: 500, seed: 20261115 }
  );
});

test("o motor de conversa NUNCA quebra com texto qualquer e só monta o resumo com tudo preenchido", async () => {
  const vocab = fc.constantFrom("agendar", "corte", "barba", "polimento", "amanhã", "hoje", "sexta", "às", "10h", "14:30", "com", "a", "o", "para", "Ana", "Rafael", "Beatriz", "João", "valor", "80", "reais", "grátis", "obs:", "cancelar", "sim", "1", "2", "?", "!", "💈", "R$", "dia", "20", "de", "novembro");
  const phrase = fc.oneof(fc.string({ maxLength: 80 }), fc.array(vocab, { minLength: 1, maxLength: 10 }).map((w) => w.join(" ")));
  await fc.assert(
    fc.asyncProperty(fc.array(phrase, { minLength: 1, maxLength: 4 }), async (turns) => {
      let state = emptyState();
      for (const text of turns) {
        const r = await runAgendarTurn({ text, state: JSON.parse(JSON.stringify(state)), catalog: CATALOG, clock: CLOCK }, PORTS);
        if (!Array.isArray(r.messages) || r.messages.length === 0) return false;
        const card = r.messages.find((m) => m.kind === "confirm")?.card;
        if (card) {
          const s = r.state.slots;
          if (!(s.servico && s.cliente && s.profissional && s.date && s.time)) return false;
          if (r.status !== "aguardando_confirmacao") return false;
        } else if (r.status === "aguardando_confirmacao") return false;
        state = r.state;
        JSON.stringify(state); // o estado precisa continuar serializável (vai para o banco)
      }
      return true;
    }),
    { numRuns: 400, seed: 20261115 }
  );
});

test("o motor de conversa é determinístico: a mesma conversa dá sempre o mesmo resultado", async () => {
  const phrases = fc.constantFrom("agendar corte para João Pedro amanhã às 10h com a Ana", "agendar barba pra Marcos sexta 14h", "quais horários livres amanhã?", "o que eu tenho amanhã?", "agendar polimento Beatriz segunda às 9h valor 300");
  await fc.assert(
    fc.asyncProperty(phrases, async (text) => {
      const run = () => runAgendarTurn({ text, state: emptyState(), catalog: CATALOG, clock: CLOCK }, PORTS);
      return JSON.stringify(await run()) === JSON.stringify(await run());
    }),
    { numRuns: 50, seed: 20261115 }
  );
});

test("nada de dado pessoal em exemplo: o faker gera nomes e telefones brasileiros plausíveis", () => {
  for (let i = 0; i < 20; i++) {
    assert.match(faker.person.fullName(), /\S+ \S+/);
    assert.match(faker.phone.number({ style: "national" }), /\d{4}/);
  }
});

test("nunca fica sem saída: se o resumo não saiu, a conversa pergunta, oferece escolha, avisa ou explica (e erro sempre vem com pergunta)", async () => {
  const days = fc.constantFrom("hoje", "amanhã", "segunda", "sábado", "domingo", "dia 20", "dia 30/11", "semana que vem sexta");
  const hours = fc.constantFrom("8h", "9h", "12h", "13h", "17h30", "18h", "20h", "às 2 da tarde", "meio dia", "de manhã", "à tarde");
  const svcs = fc.constantFrom("corte", "barba", "polimento", "escova", "hidratação", "teste onda E");
  const pros = fc.constantFrom("", "com a Ana", "com o Rafael", "com o Felipe", "qualquer profissional");
  const clients = fc.constantFrom("João Pedro", "Beatriz", "Juliana Ferreira", "Marcos", "Zé Ninguém");
  await fc.assert(
    fc.asyncProperty(svcs, clients, days, hours, pros, async (s, c, d, h, p) => {
      const text = `agendar ${s} para ${c} ${d} ${h} ${p}`.trim();
      let state = emptyState();
      const r = await runAgendarTurn({ text, state, catalog: CATALOG, clock: { today: "2026-11-15", nowMinutes: 11 * 60 } }, PORTS);
      const kinds = r.messages.map((m) => m.kind);
      if (kinds.includes("confirm")) return true;
      const guides = kinds.some((k) => k === "ask" || k === "disambiguate");
      if (kinds.includes("error") && !guides) return false; // erro sem dizer o que fazer
      return guides || kinds.includes("notice");
    }),
    { numRuns: 300, seed: 20261115 }
  );
});
