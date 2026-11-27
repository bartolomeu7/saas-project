import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, describe, it, mock } from "node:test";

/**
 * Catálogo público (getPublicPlans): só em tempo de requisição, cache apenas do sucesso e nunca preço vencido quando o
 * banco falha. O módulo REAL é carregado com dublês no lugar do Next e do Supabase (nenhuma chamada de rede).
 */
const db = { calls: 0, fail: false, connections: 0, building: false };
globalThis.__catalogDb = db;

const rpc = `({ rpc: () => ({ abortSignal: async () => {
  const db = globalThis.__catalogDb;
  db.calls++;
  return db.fail ? { data: null, error: { message: "fetch failed" } } : { data: [{ id: "p1", name: "Mensal", price: 10 }], error: null };
} }) })`;
const STUBS = {
  "server-only": "",
  "next/server": `export async function connection() {
    const db = globalThis.__catalogDb;
    db.connections++;
    if (db.building) throw new Error("pré-geração interrompida");
  }`,
  "@/lib/supabase/public": `export const createPublicClient = () => ${rpc};`,
  "@/lib/supabase/server": `export const createSessionClient = async () => ${rpc};`,
  "@/lib/billing/guard": "export const getActiveSubscription = null, getSubscriptionGuardStatus = null;",
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier in STUBS) return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
    if (specifier === "@/lib/billing/pricing-display") return next(new URL("../../src/lib/billing/pricing-display.ts", import.meta.url).href, context);
    return next(specifier, context);
  },
});

const { getPublicPlans, clearPublicPlansCache } = await import("../../src/lib/billing/queries.ts");

describe("getPublicPlans — catálogo do site", () => {
  beforeEach(() => {
    Object.assign(db, { calls: 0, fail: false, connections: 0, building: false });
    clearPublicPlansCache();
    mock.method(console, "error", () => {});
  });

  it("no build não consulta o banco nem devolve lista vazia: a interrupção do Next chega a quem chamou", async () => {
    db.building = true;
    await assert.rejects(getPublicPlans(), /pré-geração interrompida/);
    assert.equal(db.calls, 0);
  });

  it("guarda o sucesso por 60 s (e connection() roda mesmo com o cache quente)", async () => {
    let now = 1_000_000;
    mock.method(Date, "now", () => now);
    assert.equal((await getPublicPlans()).length, 1);
    now += 59_000;
    assert.equal((await getPublicPlans()).length, 1);
    assert.deepEqual([db.calls, db.connections], [1, 2]);
    now += 2_000;
    await getPublicPlans();
    assert.equal(db.calls, 2);
    mock.restoreAll();
  });

  it("falha não fica em cache: a visita seguinte tenta de novo e se recupera", async () => {
    db.fail = true;
    assert.deepEqual(await getPublicPlans(), []);
    db.fail = false;
    assert.equal((await getPublicPlans()).length, 1);
    assert.equal(db.calls, 2);
  });

  it("com o cache vencido e o banco fora, mostra indisponível (não o preço antigo)", async () => {
    let now = 1_000_000;
    mock.method(Date, "now", () => now);
    await getPublicPlans();
    now += 61_000;
    db.fail = true;
    assert.deepEqual(await getPublicPlans(), []);
    mock.restoreAll();
  });

  it("salvar um plano no /admin limpa o cache", async () => {
    await getPublicPlans();
    clearPublicPlansCache();
    await getPublicPlans();
    assert.equal(db.calls, 2);
  });

  it("a tela autenticada não usa nem preenche o cache público", async () => {
    await getPublicPlans({ authenticated: true });
    await getPublicPlans({ authenticated: true });
    await getPublicPlans();
    assert.deepEqual([db.calls, db.connections], [3, 1]);
  });
});
