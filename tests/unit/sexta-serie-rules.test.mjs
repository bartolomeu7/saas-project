import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSINESS_TYPES, createCompanySchema } from "../../src/lib/validations/company.ts";
import { cleanPersonName, personNameError } from "../../src/lib/settings/person-name.ts";

const read = (rel) => readFileSync(rel, "utf8");
const company = (name, businessType = "service_provider") => createCompanySchema.safeParse({ name, businessType });
const companyError = (name, type) => {
  const result = company(name, type);
  return result.success ? null : result.error.issues[0].message;
};

/** 6ª série (20/11/2026): Configurações aceitava nome de empresa "12345", com caracteres invisíveis e espaços repetidos. */
test("empresa: nome com letras, de 2 a 160 caracteres, sem invisíveis nem espaços repetidos", () => {
  assert.equal(company("Salão    Beleza     Pura").data.name, "Salão Beleza Pura");
  assert.equal(company("Salão‮ Beleza​ X").data.name, "Salão Beleza X");
  assert.equal(company("  espaços nas pontas  ").data.name, "espaços nas pontas");
  assert.match(companyError(""), /Informe o nome/);
  assert.match(companyError("     "), /Informe o nome/);
  assert.match(companyError("a"), /pelo menos 2/);
  assert.match(companyError("12345"), /com letras/);
  assert.match(companyError("a".repeat(161)), /muito longo/);
  assert.equal(company("a".repeat(160)).success, true);
  for (const ok of ["3M do Brasil", "João D'Ávila-Filho Ltda", "Café ☕ & Cia", "<img src=x onerror=alert(1)>"]) {
    assert.equal(company(ok).success, true, ok);
  }
});

test("empresa: os 10 segmentos valem e qualquer outro é recusado", () => {
  assert.equal(BUSINESS_TYPES.length, 10);
  for (const type of BUSINESS_TYPES) assert.equal(company("Empresa Boa", type).success, true, type);
  assert.match(companyError("Empresa Boa", "loja"), /segmento válido/);
  assert.match(companyError("Empresa Boa", null), /segmento válido/);
});

test("nome de pessoa (perfil): limpeza e validação", () => {
  assert.equal(cleanPersonName("Ana    Maria"), "Ana Maria");
  assert.equal(cleanPersonName("Ana‮​"), "Ana");
  assert.equal(cleanPersonName(null), "");
  assert.equal(personNameError("Maria", "Silva"), null);
  assert.equal(personNameError("Maria", ""), null);
  assert.match(personNameError("", "X"), /primeiro nome/);
  assert.match(personNameError("   ", "X"), /primeiro nome/);
  assert.match(personNameError("‮​", "X"), /primeiro nome/);
  assert.match(personNameError("12345", "678"), /letras/);
  assert.match(personNameError("Ana", "999"), /sobrenome precisa ter letras/);
  assert.match(personNameError("A".repeat(81), ""), /muito longo/);
  assert.equal(personNameError("José D'Ávila ☕", "Filho"), null);
});

test("fiação: perfil usa o limpador e o sincronizador também; tema claro sem verde/âmbar fraco", () => {
  const form = read("src/components/settings/profile-identity-form.tsx");
  assert.ok(form.includes("personNameError(first, last)"));
  assert.ok(form.includes("cleanPersonName(first)"));
  assert.ok(read("src/lib/settings/actions.ts").includes("cleanPersonName("));
  for (const file of [
    "src/app/(app)/app/caixa/page.tsx",
    "src/app/(app)/app/estoque/page.tsx",
    "src/app/(app)/app/financeiro/page.tsx",
    "src/components/app/cash-movements-table.tsx",
  ]) {
    assert.ok(!/text-emerald-600 /.test(read(file)), file + ": texto verde-600 tem contraste 3,8:1 no tema claro (use 700)");
  }
  assert.ok(!/text-xs text-amber-600 /.test(read("src/components/app/agenda-action-forms.tsx")));
});

test("Financeiro: categoria e centro de custo — letras, espaços juntados e nome repetido avisa (sem 'salva' falso)", () => {
  const src = read("src/lib/finance/actions.ts");
  assert.ok(src.includes('nameInUse(supabase, "financial_categories", current.company.id, name, undefined, { kind })'));
  assert.ok(src.includes('nameInUse(supabase, "cost_centers", current.company.id, name)'));
  assert.ok(src.includes("Já existe uma categoria de"));
  assert.ok(src.includes("Já existe um centro de custo com esse nome."));
  assert.ok(src.includes("O nome da categoria precisa ter letras."));
  assert.ok(src.includes("O nome do centro de custo precisa ter letras."));
  assert.equal((src.match(/collapseSpaces\(textValue\(formData\.get\("name"\)\)\)/g) ?? []).length, 2);
  const helper = read("src/lib/validations/name-in-use.ts");
  assert.ok(helper.includes('"financial_categories"') && helper.includes('"cost_centers"'));
  assert.ok(helper.includes("extra?: Record<string, string>"));
});
