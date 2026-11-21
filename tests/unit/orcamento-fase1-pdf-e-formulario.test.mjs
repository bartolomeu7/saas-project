import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQuotePdfModel, isoToBr } from "../../src/lib/quotes/pdf-model.ts";
import { renderQuotePdf } from "../../src/lib/quotes/pdf-document.ts";
import { readQuoteForm } from "../../src/lib/quotes/form.ts";

const read = (rel) => readFileSync(rel, "utf8");

const company = {
  name: "Oficina do Zé",
  legal_name: "José da Silva ME",
  document: "11.222.333/0001-81",
  phone: "(11) 3333-4444",
  whatsapp: "(11) 98888-7777",
  email: "contato@oficina.com",
  website: "https://oficina.com",
  postal_code: "01001-000",
  address: "Rua A",
  address_number: "100",
  complement: "Sala 2",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
};
const quote = (patch = {}) => ({
  number: "ORC-2026-0001",
  status: "sent",
  customer_name: "João Açaí Ltda",
  customer_document: "529.982.247-25",
  customer_phone: "11988887777",
  customer_email: "joao@teste.com",
  customer_address: "Rua B, 10 - Campinas/SP",
  title: "Reforma da cozinha",
  issued_on: "2026-11-21",
  valid_until: "2026-12-06",
  subtotal: 216,
  discount_amount: 5,
  total_amount: 211,
  payment_terms: "50% na entrada e 50% na entrega.",
  delivery_terms: "10 dias úteis",
  notes: "Materiais por conta do cliente.",
  footer: "Obrigado pela preferência!",
  ...patch,
});
const item = (n, patch = {}) => ({ position: n, description: `Item ${n}`, unit: "un", quantity: 2, unit_price: 100.5, discount_amount: 0, total_amount: 201, ...patch });

const pages = (pdf) => (pdf.toString("latin1").match(/\/Type \/Page(?!s)/g) ?? []).length;
// 1x1 PNG válido
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("modelo do PDF: empresa, contatos, endereço e datas formatados", () => {
  const model = buildQuotePdfModel(company, quote(), [item(1)]);
  assert.equal(model.company.name, "Oficina do Zé");
  assert.equal(model.company.address, "Rua A, 100, Sala 2 - Centro - São Paulo/SP - CEP 01001-000");
  assert.deepEqual(model.company.contacts, ["Tel. (11) 3333-4444", "WhatsApp (11) 98888-7777", "contato@oficina.com", "https://oficina.com"]);
  assert.equal(model.issuedOn, "21/11/2026");
  assert.equal(model.validUntil, "06/12/2026");
  assert.equal(model.isDraft, false);
  assert.equal(isoToBr("2026-01-05"), "05/01/2026");
});

test("modelo do PDF: empresa sem dados cadastrais gera cabeçalho só com o nome (sem linhas vazias)", () => {
  const model = buildQuotePdfModel({ name: "Só Nome" }, quote(), [item(1)]);
  assert.equal(model.company.address, null);
  assert.deepEqual(model.company.contacts, []);
  assert.equal(model.company.legalName, null);
  assert.equal(model.company.document, null);
});

test("modelo do PDF: WhatsApp igual ao telefone não repete; endereço parcial não deixa separador solto", () => {
  const model = buildQuotePdfModel({ name: "X", phone: "1133", whatsapp: "1133", city: "Recife" }, quote(), [item(1)]);
  assert.deepEqual(model.company.contacts, ["Tel. 1133"]);
  assert.equal(model.company.address, "Recife");
});

test("modelo do PDF: totais, desconto e linhas em reais, sem erro de centavo", () => {
  const model = buildQuotePdfModel(company, quote(), [item(1, { quantity: 1.5, unit_price: 10, total_amount: 15, discount_amount: 0 }), item(2, { discount_amount: 1, total_amount: 200 })]);
  const brl = (text) => text.replace(/\s/g, " ");
  assert.equal(brl(model.items[0].total), "R$ 15,00");
  assert.equal(model.items[0].quantity, "1,5");
  assert.equal(model.items[0].discount, "-");
  assert.equal(brl(model.items[1].discount), "R$ 1,00");
  assert.equal(model.hasItemDiscount, true);
  assert.equal(brl(model.totals.subtotal), "R$ 216,00");
  assert.equal(brl(model.totals.discount), "R$ 5,00");
  assert.equal(brl(model.totals.total), "R$ 211,00");
  assert.equal(buildQuotePdfModel(company, quote({ discount_amount: 0 }), [item(1)]).totals.discount, null);
  assert.equal(buildQuotePdfModel(company, quote(), [item(1)]).hasItemDiscount, false);
});

test("modelo do PDF: seções vazias somem; rascunho é marcado; emoji é limpo", () => {
  const model = buildQuotePdfModel(company, quote({ status: "draft", payment_terms: null, delivery_terms: "  ", notes: "Pintura 🎨 inclusa", title: null, footer: null }), [item(1, { description: "Tinta 🎨 branca" })]);
  assert.equal(model.isDraft, true);
  assert.deepEqual(model.sections, [{ title: "Observações", text: "Pintura inclusa" }]);
  assert.equal(model.items[0].description, "Tinta branca");
  assert.equal(model.title, null);
  assert.equal(model.footer, null);
});

test("PDF real: abre com %PDF, 1 página para um orçamento simples (com e sem logo PNG)", async () => {
  const model = buildQuotePdfModel(company, quote(), [item(1), item(2)]);
  const plain = await renderQuotePdf(model, null);
  assert.equal(plain.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(pages(plain), 1);
  assert.ok(plain.length > 1000);
  const withLogo = await renderQuotePdf(model, { data: PNG, format: "png" });
  assert.equal(withLogo.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(pages(withLogo), 1);
  assert.ok(withLogo.length > plain.length, "o logo entra no arquivo");
});

test("PDF real: orçamento enorme (100 itens, textos longos) vira várias páginas e não quebra", async () => {
  const items = Array.from({ length: 100 }, (_, i) => item(i + 1, { description: "Descrição bem longa ".repeat(14) }));
  const model = buildQuotePdfModel(company, quote({ notes: "Observação longa. ".repeat(100), payment_terms: "Condição. ".repeat(80) }), items);
  const pdf = await renderQuotePdf(model, null);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pages(pdf) >= 5, `esperava várias páginas, veio ${pages(pdf)}`);
});

test("PDF real: nomes com emoji, CJK, direção invisível e caracteres raros não derrubam a geração", async () => {
  const weird = "Zé 🎨 日本語 ‮abc​ \u0000 → ½ º ª ñ ç — “aspas”";
  const model = buildQuotePdfModel({ ...company, name: weird }, quote({ customer_name: weird, title: weird, notes: weird, footer: weird }), [item(1, { description: weird, unit: "m²" })]);
  const pdf = await renderQuotePdf(model, null);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(pages(pdf), 1);
});

test("PDF real: valores extremos (limite do banco) e item de R$ 0,00 saem formatados", async () => {
  const model = buildQuotePdfModel(company, quote({ subtotal: 999999999.99, discount_amount: 0, total_amount: 999999999.99 }), [item(1, { quantity: 1, unit_price: 999999999.99, total_amount: 999999999.99 }), item(2, { unit_price: 0, total_amount: 0 })]);
  assert.match(model.totals.total.replace(/\s/g, " "), /^R\$ 999\.999\.999,99$/);
  assert.equal(model.items[1].total.replace(/\s/g, " "), "R$ 0,00");
  const pdf = await renderQuotePdf(model, null);
  assert.equal(pages(pdf), 1);
});

// ---------------------------------------------------------------- leitura do formulário
const TODAY = "2026-11-21";
const ITEMS = JSON.stringify([{ item_type: "custom", description: "Serviço", quantity: "2", unit_price: "100,50", discount_amount: "" }]);
const form = (patch = {}) => {
  const data = new FormData();
  const base = { customerName: "Maria Souza", items: ITEMS, ...patch };
  for (const [key, value] of Object.entries(base)) if (value !== undefined) data.set(key, value);
  return data;
};
const result = (patch) => readQuoteForm(form(patch), TODAY);
const errorOf = (patch) => result(patch).error ?? null;

test("formulário: caso válido vira os argumentos da função (datas vazias = padrão do banco)", () => {
  const ok = result({ title: "  Reforma  ", paymentTerms: "À vista", discount: "10,50" });
  assert.equal(ok.error, undefined);
  assert.equal(ok.args.p_customer_id, null);
  assert.equal(ok.args.p_customer_name, "Maria Souza");
  assert.equal(ok.args.p_title, "Reforma");
  assert.equal(ok.args.p_issued_on, null);
  assert.equal(ok.args.p_valid_until, null);
  assert.equal(ok.args.p_payment_terms, "À vista");
  assert.equal(ok.args.p_discount, 10.5);
  assert.equal(ok.args.p_items[0].unit_price, "100.50");
});

test("formulário: cliente cadastrado dispensa o nome digitado; id inválido é recusado", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  assert.equal(result({ customerId: id, customerName: "" }).args.p_customer_id, id);
  assert.match(errorOf({ customerId: "abc" }), /Cliente inválido/);
});

test("formulário: nome, e-mail e tamanhos", () => {
  assert.match(errorOf({ customerName: "" }), /nome do cliente/);
  assert.match(errorOf({ customerName: "A" }), /nome do cliente/);
  assert.match(errorOf({ customerName: "12345" }), /nome do cliente/);
  assert.match(errorOf({ customerName: "a".repeat(161) }), /no máximo 160/);
  assert.match(errorOf({ customerEmail: "a@b" }), /e-mail válido/);
  assert.equal(result({ customerEmail: "a@b.com" }).error, undefined);
  assert.match(errorOf({ title: "a".repeat(121) }), /assunto/);
  assert.match(errorOf({ paymentTerms: "a".repeat(1001) }), /condições de pagamento/);
  assert.match(errorOf({ deliveryTerms: "a".repeat(501) }), /prazo/);
  assert.match(errorOf({ notes: "a".repeat(2001) }), /observações/);
  assert.match(errorOf({ footer: "a".repeat(301) }), /rodapé/);
  assert.match(errorOf({ customerAddress: "a".repeat(401) }), /endereço/);
});

test("formulário: datas (formato, ordem, limites)", () => {
  assert.match(errorOf({ issuedOn: "21/11/2026" }), /emissão inválida/);
  assert.match(errorOf({ issuedOn: "2026-02-30" }), /emissão inválida/);
  assert.match(errorOf({ validUntil: "abc" }), /validade inválida/);
  assert.match(errorOf({ issuedOn: "2026-11-21", validUntil: "2026-11-20" }), /antes da emissão/);
  assert.match(errorOf({ issuedOn: "2026-11-21", validUntil: "2027-11-23" }), /no máximo 365 dias/);
  assert.equal(result({ issuedOn: "2026-11-21", validUntil: "2027-11-21" }).error, undefined);
  assert.match(errorOf({ issuedOn: "1999-12-31" }), /fora do período/);
  assert.match(errorOf({ issuedOn: "2028-01-01" }), /fora do período/);
  assert.equal(result({ validUntil: "2026-11-21" }).error, undefined, "validade no próprio dia da emissão vale");
});

test("formulário: itens e desconto geral", () => {
  assert.match(errorOf({ items: "" }), /pelo menos um item/);
  assert.match(errorOf({ items: "isso não é json" }), /pelo menos um item/);
  assert.match(errorOf({ items: "[]" }), /pelo menos um item/);
  assert.match(errorOf({ items: JSON.stringify([{ description: "x", quantity: "0", unit_price: "1" }]) }), /quantidade válida/);
  assert.match(errorOf({ discount: "999" }), /maior que o subtotal/);
  assert.match(errorOf({ discount: "abc" }), /desconto geral/);
  assert.equal(result({ discount: "201" }).error, undefined, "desconto igual ao subtotal é permitido");
  assert.equal(result({ discount: "201" }).args.p_discount, 201);
});

test("formulário: texto limpo de caracteres invisíveis e espaços repetidos", () => {
  const ok = result({ customerName: "Maria‮   ​Souza", notes: "linha 1\nlinha   2" });
  assert.equal(ok.args.p_customer_name, "Maria Souza");
  assert.equal(ok.args.p_notes, "linha 1\nlinha 2");
});

// ---------------------------------------------------------------- fiação
test("fiação: ações, rota do PDF, tela, menu e migration", () => {
  const actions = read("src/lib/quotes/actions.ts");
  assert.ok(actions.startsWith('"use server"'));
  for (const fn of ["createQuoteAction", "updateQuoteAction", "setQuoteStatusAction", "deleteQuoteAction", "duplicateQuoteAction"]) {
    assert.ok(actions.includes(`export async function ${fn}`), fn);
  }
  for (const rpc of ["create_quote", "update_quote", "set_quote_status", "delete_quote", "duplicate_quote"]) assert.ok(actions.includes(`"${rpc}"`), rpc);
  assert.ok(!/export function /.test(actions), "arquivo 'use server' só exporta funções assíncronas");
  assert.ok(actions.includes('error.code === "P0001"'), "só mensagens de regra de negócio vão para a tela");

  const route = read("src/app/api/orcamentos/[id]/pdf/route.ts");
  assert.ok(route.includes("getCurrentCompany()"), "a empresa vem da sessão");
  assert.ok(route.includes("getQuoteDetail(current.company.id, id)"), "o orçamento é buscado COM a empresa");
  assert.ok(route.includes("application/pdf") && route.includes("nosniff") && route.includes("no-store"));
  assert.ok(route.includes('runtime = "nodejs"'));

  const queries = read("src/lib/quotes/queries.ts");
  assert.ok(queries.includes('.eq("company_id", companyId)'));

  const sql = read("supabase/migrations/20261121200000_quotes.sql");
  for (const table of ["quote_counters", "quotes", "quote_items", "quote_events"]) assert.ok(sql.includes(`alter table public.${table} enable row level security`), table);
  assert.ok(sql.includes("revoke insert, update, delete on table public.quotes, public.quote_items, public.quote_events from authenticated"));
  assert.ok(read("supabase/rollback/20261121200000_quotes.down.sql").includes("drop table if exists public.quotes"));
  assert.ok(read("tests/sql/quotes.sql").includes("rollback;"));

  const page = read("src/app/(app)/app/orcamentos/page.tsx");
  assert.ok(page.includes("listQuotes(current.company.id"));
  assert.ok(read("src/components/app/nav-items.ts").includes('href: "/app/orcamentos"'));
});
