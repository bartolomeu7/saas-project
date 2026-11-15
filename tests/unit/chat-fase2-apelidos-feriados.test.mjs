import test from "node:test";
import assert from "node:assert/strict";
import { matchServices, companyHolidayWarning } from "../../src/lib/chat/agenda-agendar.ts";

const SERVICES = [
  { id: "s1", name: "Higienização Interna", durationMinutes: 120, price: 150, aliases: ["limpeza interna", "faxina"] },
  { id: "s2", name: "Polimento Técnico", durationMinutes: 90, price: 300 },
  { id: "s3", name: "Lavagem Simples", durationMinutes: 40, price: 50, aliases: ["  ", ""] },
];

test("apelido dito inteiro vale como o nome do serviço", () => {
  assert.deepEqual(matchServices("agenda uma faxina", SERVICES).map((s) => s.id), ["s1"]);
  assert.deepEqual(matchServices("quero limpeza interna amanha", SERVICES).map((s) => s.id), ["s1"]);
});

test("apelido sem acento/maiúsculas e o nome original continuam funcionando", () => {
  assert.deepEqual(matchServices("FAXINA", SERVICES).map((s) => s.id), ["s1"]);
  assert.deepEqual(matchServices("higienizacao interna", SERVICES).map((s) => s.id), ["s1"]);
});

test("serviço sem apelidos e apelidos vazios não atrapalham", () => {
  assert.deepEqual(matchServices("polimento", SERVICES).map((s) => s.id), ["s2"]);
  assert.deepEqual(matchServices("lavagem simples", SERVICES).map((s) => s.id), ["s3"]);
  assert.deepEqual(matchServices("nada a ver", SERVICES), []);
});

test("sem a propriedade aliases (coluna ainda não existe) tudo segue igual", () => {
  const plain = SERVICES.map(({ aliases, ...s }) => s);
  assert.deepEqual(matchServices("faxina", plain), []);
  assert.deepEqual(matchServices("polimento", plain).map((s) => s.id), ["s2"]);
});

const HOL = [
  { date: "2026-12-08", name: "Aniversário da cidade", yearly: true, closed: true },
  { date: "2026-12-24", name: "Recesso", yearly: false, closed: false },
];

test("feriado da empresa: data exata e repetição anual", () => {
  assert.match(companyHolidayWarning("2026-12-08", HOL, "terça, 08/12"), /Aniversário da cidade.*não atende/);
  assert.match(companyHolidayWarning("2031-12-08", HOL, "x"), /Aniversário da cidade/);
  assert.match(companyHolidayWarning("2026-12-24", HOL, "x"), /Recesso.*dia especial/);
});

test("feriado não anual só vale na data; sem cadastro ou data comum não avisa", () => {
  assert.equal(companyHolidayWarning("2027-12-24", HOL, "x"), null);
  assert.equal(companyHolidayWarning("2026-12-09", HOL, "x"), null);
  assert.equal(companyHolidayWarning("2026-12-08", undefined, "x"), null);
  assert.equal(companyHolidayWarning("2026-12-08", [], "x"), null);
});
