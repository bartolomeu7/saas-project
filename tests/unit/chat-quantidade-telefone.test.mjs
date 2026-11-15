import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fc from "fast-check";
import { extractQuantities, extractQuantity } from "../../src/lib/chat/quantity-pt.ts";
import { normalizePhoneBr, samePhone, findPhonesInText } from "../../src/lib/chat/phone-br.ts";
import { customersByPhone } from "../../src/lib/chat/customer-search.ts";
import { parseExtras } from "../../src/lib/chat/agenda-agendar.ts";

const require = createRequire(import.meta.url);

/**
 * Chat AI — fase 1 de open source: quantidades de estoque, telefone e valor por extenso.
 * O Microsoft Recognizers (só nos testes, é dependência de DESENVOLVIMENTO) serve de "juiz" para as quantidades.
 */

// ------------------------------------------------------------------ quantidades de estoque
test("quantidades por extenso, decimal e com metade", () => {
  const cases = [
    ["duas caixas", 2, "cx"], ["meio quilo", 0.5, "kg"], ["2,5 kg", 2.5, "kg"], ["dois litros e meio", 2.5, "l"], ["3kg de farinha", 3, "kg"],
    ["um e meio quilo", 1.5, "kg"], ["dez unidades", 10, "un"], ["1.500 g", 1500, "g"], ["cem gramas", 100, "g"], ["meia caixa", 0.5, "cx"],
    ["vinte e cinco metros", 25, "m"], ["250 ml", 250, "ml"], ["três pacotes", 3, "pct"], ["um kit", 1, "kit"],
  ];
  for (const [text, value, unit] of cases) {
    const q = extractQuantity(text);
    assert.deepEqual(q && [q.value, q.unit], [value, unit], text);
  }
});

test("várias quantidades na mesma frase, na ordem", () => {
  assert.deepEqual(extractQuantities("três pacotes e dois kits").map((q) => [q.value, q.unit]), [[3, "pct"], [2, "kit"]]);
  assert.deepEqual(extractQuantities("entrada de 10 caixas e 2,5 kg de cera").map((q) => [q.value, q.unit]), [[10, "cx"], [2.5, "kg"]]);
});

test("número sem unidade e palavras soltas não viram quantidade", () => {
  assert.deepEqual(extractQuantities("agendar corte às 10h com a Ana"), []);
  assert.deepEqual(extractQuantities("valor 80 reais"), []);
  assert.deepEqual(extractQuantities("quero cinquenta"), []);
});

test("propriedade: 'N unidade' devolve N (1 a 999) para toda unidade conhecida", () => {
  const units = [["caixas", "cx"], ["pacotes", "pct"], ["kg", "kg"], ["gramas", "g"], ["litros", "l"], ["ml", "ml"], ["metros", "m"], ["unidades", "un"], ["kits", "kit"]];
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 999 }), fc.constantFrom(...units), (n, [word, unit]) => {
      const q = extractQuantity(`${n} ${word}`);
      return q?.value === n && q.unit === unit;
    }),
    { numRuns: 300, seed: 20261115 }
  );
});

test("JUIZ Microsoft Recognizers: nas quantidades simples, o valor é o mesmo do nosso", () => {
  const { recognizeDimension } = require("@microsoft/recognizers-text-number-with-unit");
  const { Culture } = require("@microsoft/recognizers-text");
  const toNum = (s) => Number(String(s).replace(".", "").replace(",", "."));
  let comparados = 0;
  for (const text of ["2,5 kg", "3 kg", "meio quilo", "250 ml", "dois litros", "10 metros", "5 kg", "1,5 litros"]) {
    const ref = recognizeDimension(text, Culture.Portuguese)[0];
    if (!ref) continue;
    const ours = extractQuantity(text);
    assert.ok(ours, `nosso não achou: ${text}`);
    assert.equal(ours.value, toNum(ref.resolution.value), `${text}: nosso ${ours.value} × Recognizers ${ref.resolution.value}`);
    comparados += 1;
  }
  assert.ok(comparados >= 6, "o juiz precisa comparar a maioria dos casos");
});

// ------------------------------------------------------------------ telefone
test("telefone: vários jeitos de escrever viram o mesmo número", () => {
  for (const t of ["11 99999-0000", "(11)99999-0000", "011 99999 0000", "+55 11 99999-0000", "11999990000"]) {
    assert.equal(normalizePhoneBr(t)?.e164, "+5511999990000", t);
  }
  assert.equal(normalizePhoneBr("(21) 2567-9034")?.e164, "+552125679034");
  assert.equal(normalizePhoneBr("abcdefgh"), null);
  assert.equal(normalizePhoneBr("7777"), null);
  assert.ok(samePhone("(11) 99999-0000", "+55 11 99999 0000"));
  assert.ok(!samePhone("(11) 99999-0000", "(11) 99999-0001"));
});

test("telefone no texto: acha o número completo e ignora 'final 7777'", () => {
  assert.deepEqual(findPhonesInText("o cliente do telefone 11 99999-0000 e final 7777").map((p) => p.national), ["11999990000"]);
  assert.deepEqual(findPhonesInText("amanhã às 10h valor 80 reais"), []);
});

test("busca por telefone: acha o cliente mesmo com o cadastro em outro formato", () => {
  const list = [
    { id: "a", name: "João Pedro Santos", phone: "(11) 98888-7777" },
    { id: "b", name: "Maria Souza", phone: "11 3456-7812" },
    { id: "c", name: "Sem Telefone", phone: null },
  ];
  assert.deepEqual(customersByPhone(list, "11988887777").map((c) => c.id), ["a"]);
  assert.deepEqual(customersByPhone(list, "1134567812").map((c) => c.id), ["b"]);
  assert.deepEqual(customersByPhone(list, "7777").map((c) => c.id), ["a"]); // final continua funcionando
  assert.deepEqual(customersByPhone(list, "999999999"), []);
});

// ------------------------------------------------------------------ valor por extenso no agendamento
test("valor por extenso e digitado no agendamento", () => {
  assert.equal(parseExtras("agendar corte valor cento e cinquenta reais").priceOverride, 150);
  assert.equal(parseExtras("agendar corte por mil e duzentos reais").priceOverride, 1200);
  assert.equal(parseExtras("agendar corte valor 80").priceOverride, 80);
  assert.equal(parseExtras("agendar corte por R$ 35,50").priceOverride, 35.5);
  assert.equal(parseExtras("agendar corte por duas horas").priceOverride, undefined, "'duas horas' é duração, não dinheiro");
  assert.equal(parseExtras("agendar corte por duas horas").durationMinutes, 120);
});
