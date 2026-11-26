import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { required } from "../../src/lib/supabase/required.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("consulta que falha ou volta sem dados vira erro; lista vazia continua valendo", () => {
  assert.deepEqual(required({ data: [], error: null }, "listar"), []);
  assert.equal(required({ data: 0, error: null }, "somar"), 0);
  assert.throws(() => required({ data: null, error: { message: "timeout" } }, "somar o caixa"), /Não foi possível somar o caixa: timeout/);
  assert.throws(() => required({ data: [], error: { message: "negado" } }, "listar"), /negado/);
  assert.throws(() => required({ data: null, error: null }, "listar"), /sem resposta/);
});

// O Financeiro mostrava R$ 0,00 quando uma consulta falhava.
test("nenhuma consulta do Financeiro esconde erro", () => {
  const queries = read("src/lib/finance/queries.ts");
  assert.ok(!queries.includes("?? []"));
  assert.ok(!/const \{ data[ ,}:]/.test(queries), "consulta que ignora o erro");
  // uma guarda para cada ida ao banco
  const trips = (queries.match(/\.from\("|\.rpc\("/g) ?? []).length;
  assert.equal((queries.match(/required\(/g) ?? []).length, trips);
});
