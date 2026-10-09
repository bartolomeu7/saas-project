import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCurrency, formatRelative } from "../../src/lib/format.ts";
import { readJwtRole } from "../../src/lib/auth/token-claims.ts";

function fakeJwt(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(claims)}.assinatura`;
}

describe("readJwtRole", () => {
  it("lê apenas o claim role e nunca explode com token inválido", () => {
    assert.equal(readJwtRole(fakeJwt({ sub: "user_1", role: "authenticated" })), "authenticated");
    assert.equal(readJwtRole(fakeJwt({ sub: "user_1" })), null);
    assert.equal(readJwtRole(fakeJwt({ role: 5 })), null);
    assert.equal(readJwtRole("lixo"), null);
    assert.equal(readJwtRole(null), null);
    assert.equal(readJwtRole(undefined), null);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-08T12:00:00Z");

  it("descreve minutos, horas e dias", () => {
    assert.equal(formatRelative("2026-10-08T11:59:40Z", now), "agora");
    assert.equal(formatRelative("2026-10-08T11:55:00Z", now), "há 5 min");
    assert.equal(formatRelative("2026-10-08T09:00:00Z", now), "há 3 h");
    assert.equal(formatRelative("2026-10-07T11:00:00Z", now), "há 1 dia");
    assert.equal(formatRelative("2026-10-05T12:00:00Z", now), "há 3 dias");
  });
});

describe("formatCurrency", () => {
  it("formata em BRL", () => {
    assert.match(formatCurrency(89), /R\$\s?89,00/);
    assert.match(formatCurrency(1234.5), /R\$\s?1\.234,50/);
  });
});
