import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysUntilExpiry, isSubscriptionAccessActive } from "../../src/lib/billing/access.ts";
import { minimizeProviderPayload } from "../../src/lib/billing/payload.ts";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const future = "2026-11-09T12:00:00Z";
const past = "2026-09-09T12:00:00Z";

describe("regra única de acesso (prazo x vitalício)", () => {
  it("assinatura com prazo: ativa só se status trialing/active E vencimento no futuro", () => {
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: future, lifetime: false }, NOW), true);
    assert.equal(isSubscriptionAccessActive({ status: "trialing", expires_at: future, lifetime: false }, NOW), true);
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: past, lifetime: false }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "expired", expires_at: future, lifetime: false }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "cancelled", expires_at: future, lifetime: false }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "pending", expires_at: future, lifetime: false }, NOW), false);
  });

  it("vencimento exatamente agora já NÃO dá acesso (limite exclusivo)", () => {
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: new Date(NOW).toISOString(), lifetime: false }, NOW), false);
  });

  it("vitalício: ativo sem vencimento; cancelado/expirado/pendente continuam sem acesso", () => {
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: null, lifetime: true }, NOW), true);
    assert.equal(isSubscriptionAccessActive({ status: "cancelled", expires_at: null, lifetime: true }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "expired", expires_at: null, lifetime: true }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "pending", expires_at: null, lifetime: true }, NOW), false);
  });

  it("FALHA FECHADO: expires_at nulo SEM lifetime explícito nunca concede acesso", () => {
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: null, lifetime: false }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: null }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: null, lifetime: null }, NOW), false);
  });

  it("incoerência (lifetime com data) não concede acesso; data ilegível não concede", () => {
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: future, lifetime: true }, NOW), false);
    assert.equal(isSubscriptionAccessActive({ status: "active", expires_at: "não é data", lifetime: false }, NOW), false);
  });

  it("sem assinatura = sem acesso", () => {
    assert.equal(isSubscriptionAccessActive(null, NOW), false);
    assert.equal(isSubscriptionAccessActive(undefined, NOW), false);
  });

  it("dias restantes: arredonda para cima, nunca negativo, nulo para vitalício", () => {
    assert.equal(daysUntilExpiry({ status: "active", expires_at: future, lifetime: false }, NOW), 31);
    assert.equal(daysUntilExpiry({ status: "active", expires_at: past, lifetime: false }, NOW), 0);
    assert.equal(daysUntilExpiry({ status: "active", expires_at: null, lifetime: true }, NOW), null);
    assert.equal(daysUntilExpiry({ status: "active", expires_at: new Date(NOW + 3_600_000).toISOString(), lifetime: false }, NOW), 1);
  });
});

describe("minimização do payload do provedor (LGPD)", () => {
  const full = {
    id: "cmq47c6un0c05ufvvo58ohpqk",
    status: "COMPLETED",
    amount: 89,
    taxAmount: 1.2,
    amountWithTax: 87.8,
    endToEndId: "E60746948202406101500abcdef123456",
    qrCodeText: "000201...",
    qrCodeBase64: "iVBORw0...",
    qrCodeUrl: "https://example.invalid/qr.png",
    payerName: "João Silva",
    payerDocument: "12345678901",
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:05:00Z",
  };

  it("remove nome/documento do pagador e QR Code, mantém o necessário para auditar", () => {
    const payload = minimizeProviderPayload(full);
    assert.deepEqual(Object.keys(payload).sort(), ["amount", "amountWithTax", "createdAt", "endToEndId", "id", "status", "taxAmount", "updatedAt"]);
    const text = JSON.stringify(payload);
    for (const secret of ["João", "12345678901", "000201", "iVBOR", "qr.png"]) assert.equal(text.includes(secret), false, secret);
  });

  it("o valor continua presente e numérico (a função de banco lê `amount` do payload)", () => {
    assert.equal(minimizeProviderPayload(full).amount, 89);
  });

  it("campos ausentes não viram chaves vazias", () => {
    const payload = minimizeProviderPayload({ id: "x", status: "PENDING", amount: 10 });
    assert.deepEqual(payload, { id: "x", status: "PENDING", amount: 10 });
  });
});
