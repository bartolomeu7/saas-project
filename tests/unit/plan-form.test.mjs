import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanPayload, parseMoney, brasiliaLocalToIso, isoToBrasiliaLocal } from "../../src/lib/admin/plan-form.ts";

const base = () => ({
  code: "pm_nova", name: "Plano Novo", description: "  texto  ", price: "65,00", accessDurationDays: "31", billingInterval: "month",
  additionalUserLimit: "5", sortOrder: "55", trial: false, supportEnabled: true, ticketsEnabled: false, exclusiveGroupsEnabled: false,
  earlyAccessEnabled: false, status: "active", publicVisible: true, tagline: "Oferta", highlight: "popular", ctaLabel: "Assinar",
  contactUrl: "", benefitsTitle: "", comparePrice: "89,90", promoEnabled: true, promoStartsAt: "", promoEndsAt: "2026-10-31T23:59",
  showComparePrice: true, showDiscountPercent: true, applyLimitsToExisting: false,
  benefits: [{ text: " B1 ", highlighted: true, visible: true, included: true }],
});

describe("dinheiro do formulário (uma conversão, sem float acumulado)", () => {
  it("aceita vírgula decimal, ponto de milhar e ponto decimal", () => {
    assert.equal(parseMoney("89,90"), 89.9);
    assert.equal(parseMoney("1.234,56"), 1234.56);
    assert.equal(parseMoney("89.90"), 89.9);
    assert.equal(parseMoney(" 65 "), 65);
    assert.equal(parseMoney(""), null);
  });
  it("lixo vira NaN (e o schema recusa)", () => {
    for (const bad of ["abc", "R$ 89", "1e3", "--1", "89,9,9", "0x10"]) assert.ok(Number.isNaN(parseMoney(bad)), bad);
  });
});

describe("data de promoção (campo datetime-local = horário de Brasília)", () => {
  it("converte para ISO UTC e volta", () => {
    assert.equal(brasiliaLocalToIso("2026-10-20T10:00"), "2026-10-20T13:00:00.000Z");
    assert.equal(isoToBrasiliaLocal("2026-10-20T13:00:00.000Z"), "2026-10-20T10:00");
    assert.equal(brasiliaLocalToIso(""), null);
    assert.equal(isoToBrasiliaLocal(null), "");
  });
  it("formato inválido é recusado", () => {
    assert.throws(() => brasiliaLocalToIso("ontem"));
    assert.throws(() => brasiliaLocalToIso("2026-13-45T99:99"));
  });
});

describe("buildPlanPayload (validação de FORMATO; as regras comerciais são do banco)", () => {
  it("formulário válido vira payload snake_case com nulls onde o campo está vazio", () => {
    const r = buildPlanPayload(base(), { creating: true });
    assert.equal(r.ok, true);
    const p = r.payload;
    assert.equal(p.code, "PM_NOVA", "código sempre em maiúsculas");
    assert.equal(p.price, 65);
    assert.equal(p.compare_price, 89.9);
    assert.equal(p.access_duration_days, 31);
    assert.equal(p.description, "texto");
    assert.equal(p.contact_url, null);
    assert.equal(p.promo_starts_at, null);
    assert.equal(p.promo_ends_at, "2026-11-01T02:59:00.000Z");
    assert.equal(p.apply_limits_to_existing, false);
    assert.deepEqual(p.benefits, [{ text: "B1", highlighted: true, visible: true, included: true }]);
  });

  it("edição: não envia o código (imutável)", () => {
    const r = buildPlanPayload({ ...base(), code: undefined }, { creating: false });
    assert.equal(r.ok, true);
    assert.ok(!("code" in r.payload));
  });

  it("criação sem código é recusada; código inválido também", () => {
    assert.equal(buildPlanPayload({ ...base(), code: undefined }, { creating: true }).ok, false);
    assert.equal(buildPlanPayload({ ...base(), code: "1bad" }, { creating: true }).ok, false);
    assert.equal(buildPlanPayload({ ...base(), code: "a" }, { creating: true }).ok, false);
  });

  it("preço vazio => null (plano personalizado); o banco decide se o plano aceita", () => {
    const r = buildPlanPayload({ ...base(), price: "", accessDurationDays: "", comparePrice: "", promoEnabled: false }, { creating: false });
    assert.equal(r.ok, true);
    assert.equal(r.payload.price, null);
    assert.equal(r.payload.access_duration_days, null);
  });

  it("formatos inválidos são recusados com mensagem curta", () => {
    for (const [patch, text] of [
      [{ price: "abc" }, "inválido"], [{ price: "-5" }, "inválido"], [{ price: "100001" }, "inválido"], [{ price: "89,999" }, "casas decimais"],
      [{ comparePrice: "x" }, "inválido"], [{ name: "  " }, "nome"], [{ name: "x".repeat(81) }, "80"],
      [{ tagline: "x".repeat(61) }, "60"], [{ ctaLabel: "x".repeat(41) }, "40"], [{ additionalUserLimit: "-1" }, "inválido"],
      [{ additionalUserLimit: "1001" }, "inválido"], [{ sortOrder: "10001" }, "inválid"], [{ highlight: "gold" }, ""],
      [{ promoEndsAt: "amanhã" }, "inválido"], [{ status: "deleted" }, ""],
    ]) {
      const r = buildPlanPayload({ ...base(), ...patch }, { creating: true });
      assert.equal(r.ok, false, JSON.stringify(patch));
      assert.ok(r.error.toLowerCase().includes(text.toLowerCase()), `${JSON.stringify(patch)} -> ${r.error}`);
    }
  });

  it("benefícios: no máximo 20, texto 1..140, id precisa ser uuid", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ text: `b${i}` }));
    assert.equal(buildPlanPayload({ ...base(), benefits: many }, { creating: true }).ok, false);
    assert.equal(buildPlanPayload({ ...base(), benefits: [{ text: "  " }] }, { creating: true }).ok, false);
    assert.equal(buildPlanPayload({ ...base(), benefits: [{ text: "x".repeat(141) }] }, { creating: true }).ok, false);
    assert.equal(buildPlanPayload({ ...base(), benefits: [{ id: "abc", text: "x" }] }, { creating: true }).ok, false);
    const ok = buildPlanPayload({ ...base(), benefits: [{ id: "11111111-1111-4111-8111-111111111111", text: "x", visible: false }] }, { creating: false });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.payload.benefits, [{ id: "11111111-1111-4111-8111-111111111111", text: "x", highlighted: false, visible: false, included: true }]);
  });

  it("entrada que não é objeto é recusada", () => {
    for (const bad of [null, undefined, "x", 1, []]) assert.equal(buildPlanPayload(bad, { creating: true }).ok, false);
  });

  it("o payload nunca carrega campos que o cliente não deveria definir (provider, id, created_at...)", () => {
    const r = buildPlanPayload({ ...base(), provider: "evopay", id: "x", created_at: "x", lifetime: true }, { creating: true });
    assert.equal(r.ok, true);
    for (const k of ["provider", "id", "created_at", "lifetime"]) assert.ok(!(k in r.payload), k);
  });
});
