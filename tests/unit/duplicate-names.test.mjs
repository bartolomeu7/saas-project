import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeLike } from "../../src/lib/validations/name-in-use.ts";

const read = (rel) => readFileSync(rel, "utf8");

test("escapeLike deixa %, _ e barra como texto literal", () => {
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(escapeLike("Corte"), "Corte");
});

test("serviço e categorias (serviço/produto) recusam nome repetido na criação e na edição", () => {
  const svc = read("src/lib/services/actions.ts");
  assert.equal((svc.match(/nameInUse\(supabase, "services"/g) ?? []).length, 2);
  assert.ok(svc.includes("Já existe um serviço com esse nome."));
  for (const [file, table] of [
    ["src/lib/service-categories/actions.ts", "service_categories"],
    ["src/lib/product-categories/actions.ts", "product_categories"],
  ]) {
    const src = read(file);
    assert.equal((src.match(new RegExp(`nameInUse\\(supabase, "${table}"`, "g")) ?? []).length, 2, file);
    assert.ok(src.includes("Já existe uma categoria"), file);
  }
});

test("edição de cliente, serviço, produto e categorias avisa quando o cadastro não existe (em vez de 'salvar' sem efeito)", () => {
  for (const file of [
    "src/lib/customers/actions.ts",
    "src/lib/services/actions.ts",
    "src/lib/products/actions.ts",
    "src/lib/service-categories/actions.ts",
    "src/lib/product-categories/actions.ts",
  ]) {
    const src = read(file);
    assert.ok(src.includes("updatedRows.length === 0"), file);
    assert.ok(/não encontrad[oa]\. O cadastro pode ter sido removido/.test(src), file);
  }
});
