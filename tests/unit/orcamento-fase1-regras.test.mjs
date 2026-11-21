import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysIso,
  allowedTransitions,
  canDeleteQuote,
  canEditQuote,
  computeTotals,
  cleanLine,
  daysBetweenIso,
  displayStatus,
  formatCents,
  isValidIsoDate,
  lineGrossCents,
  normalizeDecimal,
  parseQuoteItems,
  pdfSafeText,
  quoteFileName,
  toCents,
  toMilli,
} from "../../src/lib/quotes/rules.ts";

const item = (patch = {}) => ({ item_type: "custom", description: "Instalação", quantity: "2", unit_price: "100,50", discount_amount: "", ...patch });
const parse = (rows) => parseQuoteItems(rows);
const err = (rows) => {
  const r = parse(rows);
  return r.ok ? null : r.error;
};

test("situação mostrada: enviado com validade passada vira Vencido; o resto não muda", () => {
  assert.equal(displayStatus("sent", "2026-11-20", "2026-11-21"), "expired");
  assert.equal(displayStatus("sent", "2026-11-21", "2026-11-21"), "sent", "vale até o fim do dia da validade");
  assert.equal(displayStatus("draft", "2020-01-01", "2026-11-21"), "draft");
  assert.equal(displayStatus("approved", "2020-01-01", "2026-11-21"), "approved");
  assert.equal(displayStatus("rejected", "2020-01-01", "2026-11-21"), "rejected");
});

test("transições permitidas espelham o banco", () => {
  const today = "2026-11-21";
  assert.deepEqual(allowedTransitions("draft", "2026-12-01", today), ["sent"]);
  assert.deepEqual(allowedTransitions("draft", "2026-11-01", today), [], "rascunho vencido não envia");
  assert.deepEqual(allowedTransitions("sent", "2026-12-01", today), ["approved", "rejected", "draft"]);
  assert.deepEqual(allowedTransitions("sent", "2026-11-01", today), ["rejected", "draft"], "vencido não aprova");
  assert.deepEqual(allowedTransitions("rejected", "2026-12-01", today), ["draft"]);
  assert.deepEqual(allowedTransitions("approved", "2026-12-01", today), []);
  assert.deepEqual(allowedTransitions("converted", "2026-12-01", today), []);
  assert.equal(canEditQuote("draft"), true);
  for (const s of ["sent", "approved", "rejected", "converted"]) {
    assert.equal(canEditQuote(s), false, s);
    assert.equal(canDeleteQuote(s), false, s);
  }
});

test("números: formato brasileiro e com ponto; casas, sinal e lixo", () => {
  assert.equal(normalizeDecimal("1.234,56", 2), "1234.56");
  assert.equal(normalizeDecimal("10,5", 2), "10.5");
  assert.equal(normalizeDecimal("2.5", 3), "2.5");
  assert.equal(normalizeDecimal("1.234.567", 2), "1234567");
  assert.equal(normalizeDecimal("  7 ", 2), "7");
  assert.equal(normalizeDecimal("0", 2), "0");
  for (const bad of ["", "abc", "-1", "1,234", "1e5", "1,2,3", "R$ 10", "1.0005", "NaN", "Infinity", "9".repeat(13)]) {
    assert.equal(normalizeDecimal(bad, 2), null, bad);
  }
  assert.equal(normalizeDecimal("1,234", 3), "1.234");
});

test("conta em centavos e milésimos, sem erro de ponto flutuante", () => {
  assert.equal(toCents("100.50"), 10050);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("1234567.89"), 123456789);
  assert.equal(toMilli("1.5"), 1500);
  assert.equal(toMilli("0.001"), 1);
  assert.equal(lineGrossCents(2000, 10050), 20100, "2 × 100,50");
  assert.equal(lineGrossCents(1500, 1000), 1500, "1,5 × 10,00");
  assert.equal(lineGrossCents(3333, 1000), 3333, "3,333 × 10,00 = 33,33");
  assert.equal(lineGrossCents(1, 1), 0, "0,001 × 0,01 arredonda para 0");
  assert.equal(lineGrossCents(500, 1), 1, "meio centavo sobe, como o round() do banco");
  assert.equal(lineGrossCents(999_999_999_999, 99_999_999_999) > 0, true, "números grandes não perdem precisão (BigInt)");
  assert.match(formatCents(21500).replace(/\s/g, " "), /^R\$ 215,00$/);
});

test("itens: válidos são normalizados (vírgula vira ponto, vazio vira 0)", () => {
  const r = parse([item(), item({ description: "  Item   B ", quantity: "1,5", unit_price: "10", unit: "m" })]);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].quantity, "2");
  assert.equal(r.items[0].unit_price, "100.50");
  assert.equal(r.items[0].discount_amount, "0");
  assert.equal(r.items[0].unit, "un");
  assert.equal(r.items[1].description, "Item B");
  assert.equal(r.items[1].unit, "m");
  assert.deepEqual(r.lines.map((l) => l.totalCents), [20100, 1500]);
});

test("itens: erros citam o número do item", () => {
  assert.match(err([]), /pelo menos um item/);
  assert.match(err(null), /pelo menos um item/);
  assert.match(err("x"), /pelo menos um item/);
  assert.match(err(Array.from({ length: 101 }, () => item())), /no máximo 100/);
  assert.equal(parse(Array.from({ length: 100 }, () => item())).ok, true);
  assert.match(err([item(), item({ description: "   " })]), /Descreva o item 2/);
  assert.match(err([item({ description: "a".repeat(301) })]), /item 1 pode ter no máximo 300/);
  assert.match(err([item({ quantity: "0" })]), /quantidade válida no item 1/);
  assert.match(err([item({ quantity: "-2" })]), /quantidade válida/);
  assert.match(err([item({ quantity: "1,0005" })]), /quantidade válida/);
  assert.match(err([item({ quantity: "abc" })]), /quantidade válida/);
  assert.match(err([item({ unit_price: "" })]), /preço válido/);
  assert.match(err([item({ unit_price: "-1" })]), /preço válido/);
  assert.match(err([item({ unit_price: "1,005" })]), /preço válido/);
  assert.match(err([item({ discount_amount: "abc" })]), /desconto do item 1/);
  assert.match(err([item({ discount_amount: "300" })]), /desconto do item 1 não pode ser maior/);
  assert.match(err([item({ item_type: "hack" })]), /Tipo do item 1/);
  assert.match(err([item({ item_type: "product" })]), /Escolha o produto do item 1/);
  assert.match(err([item({ item_type: "service", service_id: "123" })]), /Escolha o serviço do item 1/);
  assert.match(err([item({ unit: "a".repeat(13) })]), /unidade do item 1/);
  assert.match(err([item({ quantity: "999999999", unit_price: "999999999" })]), /passa do limite/);
  assert.match(err([null]), /Item 1 inválido/);
});

test("itens: produto e serviço exigem UUID; desconto igual ao valor do item é permitido; preço zero também", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  assert.equal(parse([item({ item_type: "product", product_id: id })]).ok, true);
  assert.equal(parse([item({ item_type: "service", service_id: id })]).ok, true);
  assert.equal(parse([item({ discount_amount: "201" })]).ok, true);
  assert.equal(parse([item({ discount_amount: "201,00" })]).ok, true);
  assert.equal(parse([item({ unit_price: "0" })]).ok, true);
  // product_id de um item "custom" é ignorado (não vaza para o banco)
  assert.equal(parse([item({ product_id: id })]).items[0].product_id, null);
});

test("itens: caracteres de controle e direção invisível saem da descrição", () => {
  assert.equal(cleanLine("Pintura‮​ externa\u0000"), "Pintura externa");
  assert.equal(parse([item({ description: "Ab‮c​" })]).items[0].description, "Abc");
});

test("totais: soma das linhas, desconto geral e limites", () => {
  const lines = parse([item(), item({ description: "B", quantity: "1,5", unit_price: "10" })]).lines;
  const ok = computeTotals(lines, "5");
  assert.equal(ok.ok, true);
  assert.equal(ok.totals.subtotalCents, 21600 - 0);
  assert.equal(ok.totals.discountCents, 500);
  assert.equal(ok.totals.totalCents, 21100);
  assert.equal(computeTotals(lines, "").totals.totalCents, 21600);
  assert.equal(computeTotals(lines, "216,00").totals.totalCents, 0, "desconto igual ao subtotal zera");
  assert.match(computeTotals(lines, "216,01").error, /maior que o subtotal/);
  assert.match(computeTotals(lines, "abc").error, /desconto geral é inválido/);
  assert.match(computeTotals(lines, "-1").error, /desconto geral é inválido/);
  assert.match(computeTotals(lines, "1,005").error, /desconto geral é inválido/);
  const huge = { grossCents: 99_999_999_999, discountCents: 0, totalCents: 99_999_999_999 };
  assert.match(computeTotals([huge, huge], "0").error, /passa do limite/);
});

test("datas: validade real, soma e diferença de dias", () => {
  assert.equal(isValidIsoDate("2026-02-28"), true);
  assert.equal(isValidIsoDate("2028-02-29"), true);
  for (const bad of ["2026-02-30", "2026-13-01", "2026-1-1", "", "26-01-01", "2026-00-10", "2026-04-31"]) assert.equal(isValidIsoDate(bad), false, bad);
  assert.equal(addDaysIso("2026-11-21", 15), "2026-12-06");
  assert.equal(addDaysIso("2026-12-20", 15), "2027-01-04");
  assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29");
  assert.equal(daysBetweenIso("2026-11-21", "2026-12-06"), 15);
  assert.equal(daysBetweenIso("2026-12-06", "2026-11-21"), -15);
});

test("texto do PDF: mantém acentos e R$, tira emoji e símbolos que a fonte não tem", () => {
  assert.equal(pdfSafeText("Instalação elétrica — R$ 1.500,00 • açaí"), "Instalação elétrica - R$ 1.500,00 - açaí");
  assert.equal(pdfSafeText("Pintura 🎨 e reforma 🏠"), "Pintura e reforma");
  assert.equal(pdfSafeText("日本語 texto"), "texto");
  assert.equal(pdfSafeText("“aspas” e ‘simples’"), '"aspas" e \'simples\'');
  assert.equal(pdfSafeText("a → b"), "a -> b");
  assert.equal(pdfSafeText("linha 1\n\n\n\nlinha 2"), "linha 1\n\nlinha 2");
  assert.equal(pdfSafeText("a\u0000b‮c"), "abc");
  assert.equal(pdfSafeText("   "), "");
  assert.equal(pdfSafeText("1½ m² ºª"), "1½ m² ºª");
});

test("nome do arquivo PDF: sem acento, barra, aspas nem caracteres proibidos", () => {
  assert.equal(quoteFileName("ORC-2026-0001", "João da Silva"), "Orcamento ORC-2026-0001 - Joao da Silva.pdf");
  assert.equal(quoteFileName("ORC-2026-0001", '../../etc/passwd"<>|:*?'), "Orcamento ORC-2026-0001 - etcpasswd.pdf");
  assert.equal(quoteFileName("ORC-2026-0001", "🎨"), "Orcamento ORC-2026-0001.pdf");
  assert.ok(quoteFileName("ORC-2026-0001", "a".repeat(200)).length < 80);
  assert.equal(quoteFileName("ORC/../1", "x"), "Orcamento ORC1 - x.pdf");
});
