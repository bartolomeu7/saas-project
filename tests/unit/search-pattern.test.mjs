import test from "node:test";
import assert from "node:assert/strict";
import { accentInsensitiveRegex, buildSearchOr, digitsRegex, sanitizeSearchTerm } from "../../src/lib/search/pattern.ts";
import { readFileSync } from "node:fs";
import { collapseSpaces } from "../../src/lib/validations/common.ts";

const matches = (regex, text) => new RegExp(regex, "i").test(text);

test("busca sem acento: 'jose' acha 'José', 'ALVARES' acha 'Álvares', e vice-versa", () => {
  assert.ok(matches(accentInsensitiveRegex("jose"), "José Álvares"));
  assert.ok(matches(accentInsensitiveRegex("ALVARES"), "José Álvares"));
  assert.ok(matches(accentInsensitiveRegex("Álvares"), "alvares"));
  assert.ok(matches(accentInsensitiveRegex("ação"), "Ação de Graças"));
  assert.ok(!matches(accentInsensitiveRegex("jose"), "Joana"));
});

test("caracteres especiais do termo viram texto literal na expressão regular", () => {
  assert.ok(matches(accentInsensitiveRegex("a.b"), "xa.by"));
  assert.ok(!matches(accentInsensitiveRegex("a.b"), "axb"));
  assert.ok(matches(accentInsensitiveRegex("100%"), "promo 100% off"));
  assert.ok(matches(accentInsensitiveRegex("c++"), "linguagem c++"));
  assert.ok(matches(accentInsensitiveRegex("[x]"), "item [x]"));
});

test("vírgula, parênteses, aspas e barra invertida (sintaxe do .or) são removidos; vazio vira null", () => {
  assert.equal(sanitizeSearchTerm('  a,b(c)"d\\e '), "abcde");
  assert.equal(accentInsensitiveRegex("   "), null);
  assert.equal(accentInsensitiveRegex(',()"'), null);
  assert.equal(buildSearchOr("", ["name"]), null);
});

test("número sem pontuação acha CPF e telefone formatados", () => {
  assert.ok(matches(digitsRegex("39053344705"), "390.533.447-05"));
  assert.ok(matches(digitsRegex("1133334444"), "(11) 3333-4444"));
  assert.ok(matches(digitsRegex("(11) 3333"), "(11) 3333-4444"));
  assert.ok(matches(digitsRegex("11 3333-4444"), "(11) 3333-4444"));
  assert.ok(!matches(digitsRegex("39053344799"), "390.533.447-05"));
  assert.equal(digitsRegex("12"), null);
  assert.equal(digitsRegex("abc123"), null);
});

test("buildSearchOr junta as colunas de texto e, para números, as de dígitos", () => {
  const text = buildSearchOr("jose", ["name", "email"], ["phone"]);
  assert.match(text, /^name\.imatch\..+,email\.imatch\..+,phone\.imatch\./);
  assert.ok(!/\\D\*/.test(text), "termo com letras não gera a busca por dígitos");
  const number = buildSearchOr("39053344705", ["name"], ["document"]);
  assert.match(number, /document\.imatch\.3\\D\*9\\D\*0/);
  assert.ok(!buildSearchOr("39053344705", ["name"]).includes("\\D*"), "sem colunas de dígitos, nada de busca numérica");
});

test("as listas e o balcão de vendas usam a busca tolerante (nada de ilike solto)", async () => {
  for (const file of ["customers", "products", "services", "suppliers", "hr", "sales"]) {
    const src = readFileSync(`src/lib/${file}/queries.ts`, "utf8");
    assert.ok(src.includes("buildSearchOr"), file);
    assert.ok(!/\.ilike\(|\.ilike\./.test(src), `${file} ainda tem ilike`);
  }
});

test("cliente: nome precisa de letras, cidade não pode ser só número e espaços repetidos são juntados", () => {
  const customer = readFileSync("src/lib/validations/customer.ts", "utf8");
  assert.ok(customer.includes("value.length >= 2 && /\\p{L}/u.test(value)"));
  assert.ok(customer.includes("Informe uma cidade válida"));
  assert.equal(collapseSpaces("Maria     da   Silva"), "Maria da Silva");
  assert.equal(collapseSpaces("linha 1\n\nlinha 2"), "linha 1\n\nlinha 2");
  assert.ok(readFileSync("src/lib/validations/common.ts", "utf8").includes("collapseSpaces(cleanText(v))"));
});
