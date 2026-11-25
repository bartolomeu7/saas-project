import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/** O publicar.ps1 do servidor recusa migração nova sem script de volta: pegar a falta aqui, antes do merge. */
const root = new URL("../../supabase/", import.meta.url);
const LEDGER_START = "20261121000000"; // mesmo corte do publicar.ps1

describe("migrações publicáveis", () => {
  it("toda migração a partir do registro tem o seu arquivo em supabase/rollback/", () => {
    const missing = readdirSync(new URL("migrations/", root))
      .filter((name) => /^\d{14}_.*\.sql$/.test(name) && name.slice(0, 14) >= LEDGER_START)
      .filter((name) => !existsSync(new URL("rollback/" + name.replace(/\.sql$/, ".down.sql"), root)));
    assert.deepEqual(missing, []);
  });
});
