import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthReport, checkWithTimeout } from "../../src/lib/health/check.ts";

const AT = new Date("2026-11-07T12:00:00.000Z");

test("banco respondendo: status ok com versão e horário", async () => {
  const r = await buildHealthReport(async () => true, "abc1234", AT);
  assert.deepEqual(r, { status: "ok", version: "abc1234", checks: { database: "ok" }, at: "2026-11-07T12:00:00.000Z" });
});

test("sonda devolve false: degradado", async () => {
  const r = await buildHealthReport(async () => false, "abc1234", AT);
  assert.equal(r.status, "degraded");
  assert.equal(r.checks.database, "fail");
});

test("sonda lança erro: degradado e sem vazar a mensagem", async () => {
  const r = await buildHealthReport(
    async () => {
      throw new Error("senha do banco: segredo");
    },
    "abc1234",
    AT
  );
  assert.equal(r.status, "degraded");
  assert.ok(!JSON.stringify(r).includes("segredo"));
});

test("sonda lenta: estoura o limite e vira fail", async () => {
  const result = await checkWithTimeout(() => new Promise((resolve) => setTimeout(() => resolve(true), 500)), 20);
  assert.equal(result, "fail");
});

test("sonda dentro do limite: ok", async () => {
  const result = await checkWithTimeout(async () => true, 500);
  assert.equal(result, "ok");
});
