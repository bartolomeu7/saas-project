import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/** O servidor próprio só tem o banco e a API dele: o código não pode depender de outros serviços do Supabase. */
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe("estabilidade dos módulos no servidor próprio", () => {
  it("nada no código usa serviço de arquivos, funções de borda ou tempo real (não existem aqui)", () => {
    for (const file of walk(join(root, "src")).filter((f) => /\.tsx?$/.test(f) && !f.includes("types"))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /\.storage\s*\.?\s*from\(|\.functions\.invoke\(|\.channel\(["'`]/, file);
    }
  });

  it("o limite de envio do servidor cobre o tamanho máximo do anexo", () => {
    const max = Number(read("src/lib/customer-documents/actions.ts").match(/MAX_FILE_SIZE = (\d+) \* 1024 \* 1024/)[1]);
    const limit = Number(read("next.config.js").match(/bodySizeLimit: "(\d+)mb"/)[1]);
    assert.ok(limit > max, `limite ${limit} MB para anexo de ${max} MB`);
    assert.match(read("src/components/app/customer-documents-tab.tsx"), new RegExp(`até ${max} MB`));
    const column = Number(read("supabase/migrations/20261126000000_module_stability.sql").match(/between 1 and (\d+)/)[1]);
    assert.ok(column >= Math.ceil((max * 1024 * 1024) / 3) * 4, "a coluna comporta o arquivo em base64");
  });

  it("o download do anexo filtra pela empresa da sessão e nunca abre o arquivo como página", () => {
    const route = read("src/app/api/clientes/documentos/[id]/route.ts");
    assert.equal((route.match(/\.eq\("company_id", current\.company\.id\)/g) ?? []).length, 2);
    assert.match(route, /"content-disposition": `attachment;/);
    assert.match(route, /default-src 'none'; sandbox/);
  });

  it("as rotinas diárias são disparadas pelo uso do sistema", () => {
    assert.match(read("src/app/api/presence/route.ts"), /rpc\("run_daily_maintenance"\)/);
  });
});
