import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  endOfDayExclusiveIso,
  parseDateParam,
  parseEnum,
  parsePage,
  parseSearch,
  parseUuid,
  startOfDayIso,
} from "../../src/lib/admin/params.ts";

describe("parsePage", () => {
  it("aceita páginas válidas e cai para 1 em qualquer lixo", () => {
    assert.equal(parsePage("3"), 3);
    assert.equal(parsePage(["4", "9"]), 4);
    for (const bad of [undefined, "", "0", "-2", "abc", "1.5x", "100001", "NaN"]) {
      assert.equal(parsePage(bad), 1, String(bad));
    }
  });
});

describe("parseSearch", () => {
  it("apara espaços, limita a 80 caracteres e descarta vazio", () => {
    assert.equal(parseSearch("  maria  "), "maria");
    assert.equal(parseSearch("x".repeat(200))?.length, 80);
    assert.equal(parseSearch("   "), undefined);
    assert.equal(parseSearch(undefined), undefined);
  });
});

describe("parseEnum", () => {
  it("só devolve valores da lista permitida", () => {
    const allowed = ["active", "inactive"];
    assert.equal(parseEnum("active", allowed), "active");
    assert.equal(parseEnum("'; drop table profiles;--", allowed), undefined);
    assert.equal(parseEnum(undefined, allowed), undefined);
    assert.equal(parseEnum(["inactive", "active"], allowed), "inactive");
  });
});

describe("parseUuid", () => {
  it("aceita UUID e rejeita o resto", () => {
    assert.equal(parseUuid("5af8761f-5929-4b95-b052-ea25c9a182df"), "5af8761f-5929-4b95-b052-ea25c9a182df");
    for (const bad of [undefined, "", "123", "5af8761f-5929-4b95-b052-ea25c9a182d", "../../etc/passwd", "5af8761f-5929-4b95-b052-ea25c9a182dz"]) {
      assert.equal(parseUuid(bad), undefined, String(bad));
    }
  });
});

describe("parseDateParam e limites de dia (Brasília, UTC-3)", () => {
  it("valida o formato e a data", () => {
    assert.equal(parseDateParam("2026-10-08"), "2026-10-08");
    for (const bad of [undefined, "", "08/10/2026", "2026-13-01", "2026-02-30x", "2026-1-1"]) {
      assert.equal(parseDateParam(bad), undefined, String(bad));
    }
  });

  it("início do dia em Brasília = 03:00Z; fim exclusivo = início do dia seguinte", () => {
    assert.equal(startOfDayIso("2026-10-08"), "2026-10-08T03:00:00.000Z");
    assert.equal(endOfDayExclusiveIso("2026-10-08"), "2026-10-09T03:00:00.000Z");
    assert.equal(endOfDayExclusiveIso("2026-12-31"), "2027-01-01T03:00:00.000Z");
  });
});
