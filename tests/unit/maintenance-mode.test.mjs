import test from "node:test";
import assert from "node:assert/strict";
import { isMaintenanceOn, isMaintenanceExempt, maintenanceResponse } from "../../src/lib/maintenance.ts";

test("só liga com 1/true/on (qualquer outra coisa ou vazio = desligado)", () => {
  for (const v of ["1", "true", "TRUE", " on "]) assert.equal(isMaintenanceOn(v), true, v);
  for (const v of [undefined, "", "0", "false", "off", "sim"]) assert.equal(isMaintenanceOn(v), false, String(v));
});

test("só a verificação de saúde fica fora da manutenção", () => {
  assert.equal(isMaintenanceExempt("/api/health"), true);
  for (const p of ["/", "/app", "/login", "/api/health/x", "/api/pagamentos/webhook"]) assert.equal(isMaintenanceExempt(p), false, p);
});

test("a resposta é 503, sem cache e com Retry-After", async () => {
  const r = maintenanceResponse();
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("retry-after"), "600");
  assert.match(await r.text(), /manutenção/);
});
