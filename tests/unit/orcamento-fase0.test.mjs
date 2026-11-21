import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  companyProfileSchema,
  formatCompanyDocument,
  formatPostalCode,
  normalizeCompanyProfile,
  normalizeWebsite,
  quoteDefaultsSchema,
} from "../../src/lib/validations/company-profile.ts";
import { MAX_LOGO_BYTES, checkLogoBytes, readImageSize, sniffImageType } from "../../src/lib/validations/company-logo.ts";

const read = (rel) => readFileSync(rel, "utf8");
const empty = { legalName: "", document: "", phone: "", whatsapp: "", email: "", website: "", postalCode: "", address: "", addressNumber: "", complement: "", neighborhood: "", city: "", state: "" };
const profile = (patch) => companyProfileSchema.safeParse({ ...empty, ...patch });
const profileError = (patch) => {
  const result = profile(patch);
  return result.success ? null : result.error.issues[0].message;
};

/** Orçamento, Fase 0: dados cadastrais, logo e padrões do orçamento. */
test("dados cadastrais: tudo opcional; vazio é válido", () => {
  const result = profile({});
  assert.equal(result.success, true);
  assert.equal(result.data.document, "");
  assert.equal(result.data.state, "");
});

test("dados cadastrais: CPF/CNPJ, telefone, e-mail, UF, CEP, cidade e número", () => {
  assert.equal(profile({ document: "11.222.333/0001-81" }).success, true);
  assert.equal(profile({ document: "11222333000181" }).success, true);
  assert.equal(profile({ document: "529.982.247-25" }).success, true);
  assert.match(profileError({ document: "11.222.333/0001-82" }), /CNPJ inválido/);
  assert.match(profileError({ document: "111.111.111-11" }), /CPF inválido/);
  assert.match(profileError({ document: "12345" }), /CPF .* ou CNPJ/);
  assert.match(profileError({ phone: "abc123" }), /Telefone inválido/);
  assert.match(profileError({ whatsapp: "123" }), /WhatsApp: telefone inválido/);
  assert.equal(profile({ phone: "(11) 3333-4444", whatsapp: "+55 11 98888-7777" }).success, true);
  assert.match(profileError({ email: "a@b" }), /e-mail válido/);
  assert.equal(profile({ email: "CONTATO@Empresa.COM" }).data.email, "contato@empresa.com");
  assert.match(profileError({ state: "XX" }), /UF inválida/);
  assert.equal(profile({ state: "sp" }).data.state, "SP");
  assert.match(profileError({ postalCode: "123" }), /CEP inválido/);
  assert.equal(profile({ postalCode: "01001000" }).success, true);
  assert.match(profileError({ city: "12345" }), /cidade válida/);
  assert.match(profileError({ addressNumber: "-5" }), /Número do endereço/);
  assert.equal(profile({ addressNumber: "S/N" }).success, true);
});

test("dados cadastrais: tamanhos, caracteres invisíveis e espaços repetidos", () => {
  assert.match(profileError({ legalName: "a".repeat(181) }), /Máximo de 180/);
  assert.match(profileError({ address: "a".repeat(201) }), /Máximo de 200/);
  assert.match(profileError({ complement: "a".repeat(101) }), /Máximo de 100/);
  assert.equal(profile({ legalName: "Empresa    Teste‮​ LTDA" }).data.legalName, "Empresa Teste LTDA");
});

test("formatação: documento, CEP e site", () => {
  assert.equal(formatCompanyDocument("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatCompanyDocument("52998224725"), "529.982.247-25");
  assert.equal(formatCompanyDocument("MG-123"), "MG-123");
  assert.equal(formatPostalCode("01001000"), "01001-000");
  assert.equal(formatPostalCode("01001-000"), "01001-000");
  assert.equal(normalizeWebsite("www.empresa.com.br"), "https://www.empresa.com.br");
  assert.equal(normalizeWebsite("http://empresa.com.br/x"), "http://empresa.com.br/x");
  assert.equal(normalizeWebsite(""), "");
  for (const bad of ["javascript:alert(1)", "ftp://empresa.com", "data:text/html,x", "empresa", "empresa com espaço.com", "https://" + "a".repeat(170) + ".com"]) {
    assert.equal(normalizeWebsite(bad), null, bad);
  }
  assert.match(profileError({ website: "javascript:alert(1)" }), /site válido/);
  const normalized = normalizeCompanyProfile(profile({ document: "11222333000181", postalCode: "01001000", website: "empresa.com.br" }).data);
  assert.equal(normalized.document, "11.222.333/0001-81");
  assert.equal(normalized.postalCode, "01001-000");
  assert.equal(normalized.website, "https://empresa.com.br");
});

test("padrões do orçamento: validade 1 a 365, condições até 1000 e rodapé até 300", () => {
  const q = (patch) => quoteDefaultsSchema.safeParse({ validityDays: "15", paymentTerms: "", footer: "", ...patch });
  assert.equal(q({}).success, true);
  assert.equal(q({ validityDays: "365" }).success, true);
  for (const bad of ["0", "366", "-1", "abc", "1.5", ""]) assert.equal(q({ validityDays: bad }).success, false, bad);
  assert.equal(q({ paymentTerms: "a".repeat(1000) }).success, true);
  assert.equal(q({ paymentTerms: "a".repeat(1001) }).success, false);
  assert.equal(q({ footer: "a".repeat(301) }).success, false);
  assert.equal(q({ paymentTerms: "linha 1\nlinha 2​" }).data.paymentTerms, "linha 1\nlinha 2");
});

// ---------------------------------------------------------------- logo
const png = (width, height, total = 200) => {
  const bytes = new Uint8Array(total);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};
const jpeg = (width, height, total = 200) => {
  const bytes = new Uint8Array(total);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  bytes.set([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03], 20);
  return bytes;
};
const webp = (total = 200) => {
  const bytes = new Uint8Array(total);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return bytes;
};

test("logo: o tipo vem do CONTEÚDO (PNG, JPG, WEBP); SVG, texto e executável são recusados", () => {
  assert.equal(sniffImageType(png(100, 100)), "image/png");
  assert.equal(sniffImageType(jpeg(100, 100)), "image/jpeg");
  assert.equal(sniffImageType(webp()), "image/webp");
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'.padEnd(200, " "));
  assert.equal(sniffImageType(svg), null);
  assert.equal(sniffImageType(new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(200, " "))), null);
  assert.equal(sniffImageType(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});

test("logo: dimensões de PNG e JPEG; mínimo 32 e máximo 4000 pixels", () => {
  assert.deepEqual(readImageSize(png(300, 120), "image/png"), { width: 300, height: 120 });
  assert.deepEqual(readImageSize(jpeg(640, 480), "image/jpeg"), { width: 640, height: 480 });
  assert.equal(readImageSize(webp(), "image/webp"), null);
  assert.equal(checkLogoBytes(png(300, 120)).ok, true);
  assert.equal(checkLogoBytes(jpeg(640, 480)).ok, true);
  assert.equal(checkLogoBytes(webp()).ok, true);
  assert.match(checkLogoBytes(png(16, 16)).error, /pequena demais/);
  assert.match(checkLogoBytes(png(5000, 100)).error, /grande demais em pixels/);
  assert.match(checkLogoBytes(jpeg(8000, 8000)).error, /grande demais em pixels/);
});

test("logo: tamanho do arquivo (100 bytes a 512 KB) e arquivo vazio", () => {
  assert.match(checkLogoBytes(new Uint8Array(0)).error, /Escolha uma imagem/);
  assert.match(checkLogoBytes(png(100, 100, 50)).error, /pequena demais/);
  assert.equal(checkLogoBytes(png(100, 100, MAX_LOGO_BYTES)).ok, true);
  assert.match(checkLogoBytes(png(100, 100, MAX_LOGO_BYTES + 1)).error, /até 512 KB/);
  assert.match(checkLogoBytes(new TextEncoder().encode("a".repeat(500))).error, /PNG, JPG ou WEBP/);
});

test("fiação: ações, rota do logo, tela e migration", () => {
  const actions = read("src/lib/companies/actions.ts");
  for (const fn of ["updateCompanyProfileAction", "uploadCompanyLogoAction", "removeCompanyLogoAction", "updateQuoteDefaultsAction"]) {
    assert.ok(actions.includes(`export async function ${fn}`), fn);
  }
  assert.ok(actions.includes("checkLogoBytes(bytes)"), "o tipo é conferido pelo conteúdo, não pelo nome");
  assert.ok(actions.includes('rpc("set_company_logo"') && actions.includes('rpc("update_company_profile"'));
  const route = read("src/app/api/empresa/logo/route.ts");
  assert.ok(route.includes('"x-content-type-options": "nosniff"'));
  assert.ok(route.includes("sandbox"));
  assert.ok(route.includes("getCurrentCompany()"), "a empresa vem da sessão, nunca da URL");
  assert.ok(!/searchParams|params\./.test(route));
  const page = read("src/app/(app)/app/configuracoes/empresa/page.tsx");
  for (const piece of ["<CompanyProfileForm", "<CompanyLogoCard", "<QuoteDefaultsForm", "canEditCompany(role)"]) assert.ok(page.includes(piece), piece);
  const sql = read("supabase/migrations/20261121100000_company_profile_logo_quote_defaults.sql");
  assert.ok(sql.includes("revoke insert, update, delete on table public.company_logos from authenticated"));
  assert.ok(sql.includes("company_logos_select_member"));
  assert.ok(sql.includes("assinatura do arquivo"));
  assert.ok(read("supabase/rollback/20261121100000_company_profile_logo_quote_defaults.down.sql").includes("drop table if exists public.company_logos"));
});
