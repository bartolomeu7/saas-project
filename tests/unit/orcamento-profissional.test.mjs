import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildPixPayload, crc16, isValidCnpj, isValidCpf, normalizePixKey, pixText } from "../../src/lib/quotes/pix.ts";
import {
  DEFAULT_BRAND_COLOR,
  DEFAULT_INTRO_TEXT,
  DEFAULT_QUOTE_STYLE,
  applyIntro,
  contrast,
  normalizeHexColor,
  paletteOf,
  parseQuoteStyle,
} from "../../src/lib/quotes/style.ts";
import { readQuoteStyleForm } from "../../src/lib/quotes/style-form.ts";
import { buildQuotePdfModel } from "../../src/lib/quotes/pdf-model.ts";
import { renderQuotePdf } from "../../src/lib/quotes/pdf-document.ts";

const read = (rel) => readFileSync(rel, "utf8");
const pages = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

const company = { name: "Oficina do Zé", legal_name: "José da Silva ME", document: "11.222.333/0001-81", city: "São Paulo", state: "SP" };
const quote = (patch = {}) => ({
  number: "ORC-2026-0001",
  status: "sent",
  customer_name: "João Açaí Ltda",
  customer_document: null,
  customer_phone: null,
  customer_email: null,
  customer_address: null,
  title: "Reforma",
  issued_on: "2026-11-21",
  valid_until: "2026-12-06",
  subtotal: 1300,
  discount_amount: 0,
  total_amount: 1300,
  payment_terms: null,
  delivery_terms: null,
  notes: null,
  footer: null,
  ...patch,
});
const items = [{ position: 1, description: "Serviço", unit: "un", quantity: 1, unit_price: 1300, discount_amount: 0, total_amount: 1300 }];
const style = (patch = {}) => ({ ...DEFAULT_QUOTE_STYLE, ...patch });

// ------------------------------------------------------------------ Pix
test("CRC16 confere com o exemplo oficial do manual do BR Code (1D3D)", () => {
  const body = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(body), "1D3D");
});

test("payload do Pix: estrutura, valor, nome/cidade em ASCII maiúsculo e CRC válido", () => {
  const payload = buildPixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", receiverName: "Fulano de Tal", city: "Brasília", amountCents: 130050, txid: "ORC-2026-0001" });
  assert.ok(payload.startsWith("000201"));
  assert.ok(payload.includes("0014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000"));
  assert.ok(payload.includes("54071300.50"));
  assert.ok(payload.includes("5913FULANO DE TAL") && payload.includes("6008BRASILIA"));
  assert.ok(payload.includes("0511ORC20260001"));
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
});

test("payload do Pix: valor em reais com ponto, sem milhar", () => {
  const payload = buildPixPayload({ key: "+5511988887777", receiverName: "Oficina", city: "Sao Paulo", amountCents: 130050 });
  assert.ok(payload.includes("54071300.50"), payload);
  assert.ok(payload.includes("5802BR"));
  assert.ok(payload.includes("5907OFICINA"));
  assert.ok(payload.includes("6009SAO PAULO"));
  assert.ok(payload.includes("62070503***"), "sem txid usa ***");
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
});

test("payload do Pix: sem valor (0) o campo 54 some; txid só letras e números; nome longo é cortado", () => {
  const free = buildPixPayload({ key: "a@b.com", receiverName: "x".repeat(40), city: "y".repeat(40), amountCents: 0, txid: "ORC-2026-0001" });
  assert.ok(!free.includes("5407"), "sem campo de valor");
  assert.ok(free.includes("0511ORC20260001"), free);
  assert.ok(free.includes(`5925${"X".repeat(25)}`));
  assert.ok(free.includes(`6015${"Y".repeat(15)}`));
  assert.equal(free.slice(-4), crc16(free.slice(0, -4)));
});

test("pixText tira acentos e símbolos e usa o texto de reserva quando sobra nada", () => {
  assert.equal(pixText("Açougue São José & Filhos!", 25, "X"), "ACOUGUE SAO JOSE FILHOS");
  assert.equal(pixText("???", 25, "RECEBEDOR"), "RECEBEDOR");
  assert.equal(pixText(null, 15, "BRASIL"), "BRASIL");
});

test("chave Pix: CPF e CNPJ válidos (com ou sem pontuação) viram só dígitos", () => {
  assert.deepEqual(normalizePixKey("529.982.247-25"), { ok: true, key: "52998224725", type: "cpf" });
  assert.deepEqual(normalizePixKey("52998224725"), { ok: true, key: "52998224725", type: "cpf" });
  assert.deepEqual(normalizePixKey("11.222.333/0001-81"), { ok: true, key: "11222333000181", type: "cnpj" });
  assert.deepEqual(normalizePixKey("11222333000181"), { ok: true, key: "11222333000181", type: "cnpj" });
});

test("chave Pix: CPF/CNPJ com dígito verificador errado é recusado (não vira celular por engano)", () => {
  assert.equal(normalizePixKey("529.982.247-24").ok, false);
  assert.equal(normalizePixKey("11.222.333/0001-82").ok, false);
  assert.equal(normalizePixKey("111.111.111-11").ok, false);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCnpj("11222333000181"), true);
});

test("chave Pix: celular em vários formatos vira +55DDDNÚMERO; fixo é recusado", () => {
  for (const raw of ["(11) 98888-7777", "11988887777", "+55 11 98888-7777", "5511988887777", "+5511988887777"]) {
    assert.deepEqual(normalizePixKey(raw), { ok: true, key: "+5511988887777", type: "phone" }, raw);
  }
  assert.equal(normalizePixKey("(11) 3333-4444").ok, false);
  assert.equal(normalizePixKey("123").ok, false);
});

test("chave Pix: e-mail em minúsculas, chave aleatória (UUID) e lixo", () => {
  assert.deepEqual(normalizePixKey("  Fulano.Pix@Exemplo.COM.br "), { ok: true, key: "fulano.pix@exemplo.com.br", type: "email" });
  assert.deepEqual(normalizePixKey("123E4567-E12B-12D1-A456-426655440000"), { ok: true, key: "123e4567-e12b-12d1-a456-426655440000", type: "random" });
  for (const bad of ["", "   ", "abc", "fulano@", "@x.com", "a b@c.com", "<script>", "'; drop table", "a".repeat(100) + "@x.com"]) {
    assert.equal(normalizePixKey(bad).ok, false, bad);
  }
});

// ------------------------------------------------------------------ estilo
test("estilo: sem nada salvo vale o padrão; valores ruins viram padrão", () => {
  assert.deepEqual(parseQuoteStyle(undefined), DEFAULT_QUOTE_STYLE);
  assert.deepEqual(parseQuoteStyle(null), DEFAULT_QUOTE_STYLE);
  assert.deepEqual(parseQuoteStyle("texto"), DEFAULT_QUOTE_STYLE);
  assert.deepEqual(parseQuoteStyle([]), DEFAULT_QUOTE_STYLE);
  const ruim = parseQuoteStyle({ template: "ouro", brand_color: "vermelho", show_acceptance: "sim", pix_key: 12 });
  assert.equal(ruim.template, "modern");
  assert.equal(ruim.brandColor, DEFAULT_BRAND_COLOR);
  assert.equal(ruim.showAcceptance, true);
  assert.equal(ruim.pixKey, null);
});

test("estilo: lê o que o banco guarda e respeita texto vazio (sem apresentação) e aceite desligado", () => {
  const s = parseQuoteStyle({ template: "classic", brand_color: "#0F766E", intro_text: "", pix_key: "+5511988887777", pix_name: "Oficina", show_acceptance: false });
  assert.equal(s.template, "classic");
  assert.equal(s.brandColor, "#0f766e");
  assert.equal(s.introText, null);
  assert.equal(s.pixKey, "+5511988887777");
  assert.equal(s.pixName, "Oficina");
  assert.equal(s.showAcceptance, false);
  assert.equal(parseQuoteStyle({ intro_text: "Oi" }).introText, "Oi");
  assert.equal(parseQuoteStyle({}).introText, DEFAULT_INTRO_TEXT);
});

test("cor: normaliza #abc, sem # e maiúsculas; recusa o resto", () => {
  assert.equal(normalizeHexColor("#ABC"), "#aabbcc");
  assert.equal(normalizeHexColor("0F766E"), "#0f766e");
  for (const bad of ["", "red", "#12", "#12345", "#1234567", "#gggggg", null, undefined, 123]) assert.equal(normalizeHexColor(bad), null, String(bad));
});

test("paleta: texto sobre a marca é sempre legível e a marca clara é escurecida quando usada como texto", () => {
  for (const color of ["#000000", "#ffffff", "#ffff00", "#f97316", "#0f766e", "#1f2937", "#fde047", "#7c3aed", "#b91c1c", "#22c55e"]) {
    const p = paletteOf(color);
    assert.ok(contrast(p.brand, p.onBrand) >= 4.5, `texto sobre ${color}`);
    assert.ok(contrast(p.brandText, "#ffffff") >= 4.5, `marca como texto: ${color}`);
  }
  assert.equal(paletteOf("#ffff00").onBrand, "#111827");
  assert.equal(paletteOf("#1f2937").onBrand, "#ffffff");
  assert.equal(paletteOf("lixo").brand, DEFAULT_BRAND_COLOR);
});

test("apresentação: {cliente} vira o primeiro nome; sem texto devolve null", () => {
  assert.equal(applyIntro("Olá, {cliente}! Obrigado.", "João Açaí Ltda"), "Olá, João! Obrigado.");
  assert.equal(applyIntro("Olá, {CLIENTE}!", "  "), "Olá, cliente!");
  assert.equal(applyIntro(null, "João"), null);
  assert.equal(applyIntro("   ", "João"), null);
});

// ------------------------------------------------------------------ formulário de configuração
const formOf = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const okForm = { template: "modern", brandColor: "#0f766e", introText: "Olá, {cliente}!", pixKey: "", pixName: "", showAcceptance: "on" };

test("formulário de estilo: valores válidos; Pix vem normalizado; checkbox desmarcado = false", () => {
  const r = readQuoteStyleForm(formOf({ ...okForm, pixKey: "(11) 98888-7777", pixName: "Oficina" }));
  assert.equal(r.ok, true);
  assert.equal(r.values.pixKey, "+5511988887777");
  assert.equal(r.values.showAcceptance, true);
  const off = readQuoteStyleForm(formOf({ template: "classic", brandColor: "#ABC", introText: "", pixKey: "", pixName: "" }));
  assert.equal(off.ok, true);
  assert.equal(off.values.showAcceptance, false);
  assert.equal(off.values.brandColor, "#aabbcc");
});

test("formulário de estilo: recusa modelo, cor, Pix e textos inválidos apontando o campo", () => {
  const bad = (patch) => readQuoteStyleForm(formOf({ ...okForm, ...patch }));
  assert.deepEqual([bad({ template: "ouro" }).field, bad({ brandColor: "azul" }).field, bad({ pixKey: "abc" }).field, bad({ introText: "a".repeat(601) }).field, bad({ pixName: "a".repeat(26) }).field], [
    "template",
    "brandColor",
    "pixKey",
    "introText",
    "pixName",
  ]);
  assert.equal(bad({ introText: "a".repeat(600) }).ok, true);
  assert.equal(readQuoteStyleForm(new FormData()).ok, false);
});

// ------------------------------------------------------------------ modelo do PDF
test("PDF: Pix só aparece com chave válida e valor maior que zero, com o valor do orçamento dentro do código", () => {
  const withPix = buildQuotePdfModel(company, quote(), items, style({ pixKey: "52998224725" }));
  assert.ok(withPix.pix);
  assert.equal(withPix.pix.amount.replaceAll(String.fromCharCode(160), " "), "R$ 1.300,00");
  assert.equal(withPix.pix.keyLabel, "CPF");
  assert.ok(withPix.pix.payload.includes("54071300.00"));
  assert.ok(withPix.pix.payload.includes("0511ORC20260001"), "txid = número do orçamento");
  assert.ok(withPix.pix.payload.includes("6009SAO PAULO"));
  assert.ok(withPix.pix.payload.includes("5913OFICINA DO ZE"));
  assert.equal(withPix.pix.payload.slice(-4), crc16(withPix.pix.payload.slice(0, -4)));

  assert.equal(buildQuotePdfModel(company, quote(), items, style()).pix, null, "sem chave");
  assert.equal(buildQuotePdfModel(company, quote(), items, style({ pixKey: "chave ruim" })).pix, null, "chave inválida não gera QR");
  assert.equal(buildQuotePdfModel(company, quote({ total_amount: 0, subtotal: 0 }), items, style({ pixKey: "52998224725" })).pix, null, "total zero");
});

test("PDF: nome do recebedor personalizado, apresentação com o primeiro nome e aceite ligado/desligado", () => {
  const m = buildQuotePdfModel(company, quote(), items, style({ pixKey: "52998224725", pixName: "Zé Oficina", showAcceptance: false }));
  assert.ok(m.pix.payload.includes("5910ZE OFICINA"));
  assert.equal(m.acceptance, null);
  assert.ok(m.intro.startsWith("Olá, João!"));
  assert.deepEqual(buildQuotePdfModel(company, quote(), items, style()).acceptance, { customerName: "João Açaí Ltda", companyName: "Oficina do Zé" });
  assert.equal(buildQuotePdfModel(company, quote(), items, style({ introText: null })).intro, null);
});

test("PDF: sem estilo informado, o orçamento sai no padrão (modelo moderno, cor padrão)", () => {
  const m = buildQuotePdfModel(company, quote(), items);
  assert.equal(m.template, "modern");
  assert.equal(m.palette.brand, DEFAULT_BRAND_COLOR);
  assert.equal(m.pix, null);
});

// ------------------------------------------------------------------ PDF real
test("PDF real: os dois modelos, com Pix, rascunho, cores extremas e textos com emoji geram um arquivo válido", async () => {
  const cases = [
    ["moderno com Pix", style({ template: "modern", pixKey: "52998224725", brandColor: "#0f766e" }), quote()],
    ["clássico com Pix", style({ template: "classic", pixKey: "+5511988887777", brandColor: "#b91c1c" }), quote()],
    ["rascunho moderno", style({ template: "modern" }), quote({ status: "draft" })],
    ["rascunho clássico, sem aceite", style({ template: "classic", showAcceptance: false }), quote({ status: "draft" })],
    ["cor amarela clara", style({ template: "modern", brandColor: "#ffff00" }), quote()],
    ["cor preta", style({ template: "classic", brandColor: "#000000" }), quote()],
    ["emoji e símbolos", style({ template: "modern", introText: "Olá 😀 {cliente} ✓ 日本語" }), quote({ customer_name: "Zé 😀 日本" })],
  ];
  for (const [label, st, q] of cases) {
    const pdf = await renderQuotePdf(buildQuotePdfModel(company, q, items, st), null);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", label);
    assert.ok(pages(pdf) >= 1, label);
    assert.ok(pdf.length > 2000, label);
  }
});

test("PDF real: o QR Code do Pix entra no arquivo (maior que o mesmo PDF sem Pix) e o logo continua funcionando", async () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const base = await renderQuotePdf(buildQuotePdfModel(company, quote(), items, style({ template: "modern", showAcceptance: false })), { data: PNG, format: "png" });
  const withPix = await renderQuotePdf(buildQuotePdfModel(company, quote(), items, style({ template: "modern", showAcceptance: false, pixKey: "52998224725" })), { data: PNG, format: "png" });
  assert.ok(withPix.length > base.length + 1500, "a imagem do QR entra no arquivo");
});

test("PDF real: muitos itens + Pix + aceite continuam gerando (várias páginas)", async () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ position: i + 1, description: `Item ${i + 1} com uma descrição razoavelmente longa para ocupar espaço na linha`, unit: "un", quantity: 1, unit_price: 10, discount_amount: 0, total_amount: 10 }));
  const pdf = await renderQuotePdf(buildQuotePdfModel(company, quote({ subtotal: 800, total_amount: 800 }), many, style({ pixKey: "52998224725" })), null);
  assert.ok(pages(pdf) >= 3);
});

// ------------------------------------------------------------------ fiação
test("fiação: fonte Inter, migration, ação, rota do PDF e página de configurações usam o estilo", () => {
  assert.ok(existsSync("public/fonts/Inter-Regular.woff") && existsSync("public/fonts/Inter-Bold.woff"), "fontes no public (a imagem do site copia public/)");
  assert.ok(existsSync("public/fonts/Inter-LICENSE.txt"), "licença da fonte");
  const mig = read("supabase/migrations/20261121210000_quote_style.sql");
  assert.match(mig, /create or replace function public\.update_company_quote_style\(/);
  assert.match(mig, /_company_editor\(\)/);
  assert.match(mig, /notify pgrst, 'reload schema'/);
  assert.ok(existsSync("supabase/rollback/20261121210000_quote_style.down.sql"));
  const actions = read("src/lib/companies/actions.ts");
  assert.match(actions, /update_company_quote_style/);
  assert.match(actions, /readQuoteStyleForm/);
  const route = read("src/app/api/orcamentos/[id]/pdf/route.ts");
  assert.match(route, /getQuoteStyle\(current\.company\.id\)/);
  assert.match(route, /logoForPdf/);
  const sample = read("src/app/api/orcamentos/exemplo/pdf/route.ts");
  assert.match(sample, /getCurrentCompany/);
  assert.match(sample, /status: "sent"/);
  const page = read("src/app/(app)/app/configuracoes/empresa/page.tsx");
  assert.match(page, /QuoteStyleForm/);
  assert.match(page, /getQuoteStyle/);
});
