import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePublicPlan, discountPercent, savingsAmount, promoState, formatPlanPrice, formatDiscountLabel, toPricingView, buildPricingLines, faqFacts } from "../../src/lib/billing/pricing-display.ts";
import { toCents } from "../../src/lib/billing/amount.ts";

/** Linha do catálogo público (get_public_plans) com padrões neutros; cada teste sobrescreve o que importa. */
function plan(over = {}) {
  return {
    id: "p1", code: "MONTHLY", name: "Mensal", description: "Descrição", price: 89, currency: "BRL", access_duration_days: 31,
    additional_user_limit: 2, trial: false, support_enabled: true, tickets_enabled: true, exclusive_groups_enabled: true, early_access_enabled: true,
    status: "active", kind: "standard", tagline: null, highlight: null, cta_label: null, contact_url: null, benefits_title: null, sort_order: 20,
    compare_price: null, discount_percent: null, savings_amount: null, promo_ends_at: null, benefits: [], ...over,
  };
}

describe("desconto (centavos inteiros, espelho de plan_discount_percent do banco)", () => {
  // As MESMAS linhas são afirmadas em tests/sql/plans_management.sql (grupo "discount"): paridade TS x banco.
  const parity = [
    [65, 89.9, 27.7],
    [80, 100, 20],
    [66.66, 99.99, 33.3],
    [94.5, 100, 5.5],
  ];
  for (const [price, compare, expected] of parity) {
    it(`${price} -> ${compare} = ${expected}%`, () => assert.equal(discountPercent(price, compare), expected));
  }

  it("exemplo do enunciado: economia de R$ 24,90 (~27,7%)", () => {
    assert.equal(discountPercent(65, 89.9), 27.7);
    assert.equal(savingsAmount(65, 89.9), 24.9);
    assert.equal(formatDiscountLabel(27.7), "Economize 27,7%");
  });

  it("aceita texto com vírgula decimal e rejeita lixo", () => {
    assert.equal(discountPercent("65,00", "89,90"), 27.7);
    assert.equal(discountPercent("abc", 89.9), null);
    assert.equal(discountPercent(65, "R$ 89,90"), null);
  });

  it("sem desconto quando o anterior é ausente, zero, inválido, igual ou menor", () => {
    for (const [p, c] of [[65, null], [65, undefined], [65, 0], [65, -10], [65, 65], [65, 50], [0, 50], [-1, 50], [null, 50], [Number.NaN, 50], [65, Number.POSITIVE_INFINITY]]) {
      assert.equal(discountPercent(p, c), null, `${p} -> ${c}`);
      assert.equal(savingsAmount(p, c), null, `economia ${p} -> ${c}`);
    }
  });

  it("não usa float: 1 000 pares aleatórios batem com a referência racional (arredondamento metade para cima)", () => {
    let seed = 123456789;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 1000; i++) {
      const pc = 1 + Math.floor(rnd() * 500000);          // centavos
      const cc = pc + 1 + Math.floor(rnd() * 500000);
      // referência em BigInt: round-half-up de (cc - pc) / cc * 1000 -> décimos
      const num = BigInt(cc - pc) * 1000n * 2n + BigInt(cc);
      const ref = Number(num / (2n * BigInt(cc))) / 10;
      assert.equal(discountPercent(pc / 100, cc / 100), ref, `${pc} -> ${cc}`);
    }
  });

  it("toCents local tem a MESMA semântica de amount.ts", () => {
    for (const v of [89, 89.9, "89,90", " 1,5 ", "", "  ", null, undefined, -1, "abc", Number.NaN, 0.1 + 0.2]) {
      // pricing-display não exporta toCents; a paridade é verificada pelo efeito: discountPercent usa o mesmo critério
      const viaAmount = toCents(v);
      const viaDisplay = discountPercent(v, 1_000_000_00 / 100);
      if (viaAmount === null || viaAmount <= 0) assert.equal(viaDisplay, null, String(v));
      else assert.notEqual(viaDisplay, null, String(v));
    }
  });
});

describe("estado da promoção (espelho de plan_promo_state)", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("none / scheduled / active / expired", () => {
    assert.equal(promoState(false, null, null, now), "none");
    assert.equal(promoState(true, "2026-10-21T00:00:00Z", null, now), "scheduled");
    assert.equal(promoState(true, null, null, now), "active");
    assert.equal(promoState(true, "2026-10-19T00:00:00Z", "2026-10-21T00:00:00Z", now), "active");
    assert.equal(promoState(true, null, "2026-10-20T12:00:00Z", now), "expired", "término é exclusivo");
    assert.equal(promoState(true, null, "2026-10-19T00:00:00Z", now), "expired");
  });
});

describe("visão de exibição do plano (site público e app)", () => {
  it("preço, período, preço anterior riscado e desconto vêm do catálogo; nada é recalculado aqui", () => {
    const v = toPricingView(plan({ price: 65, compare_price: 89.9, discount_percent: 27.7, savings_amount: 24.9, promo_ends_at: "2026-11-01T00:00:00Z" }));
    assert.equal(v.priceLabel, "R$ 65,00");
    assert.equal(v.comparePriceLabel, "R$ 89,90");
    assert.equal(v.discountLabel, "Economize 27,7%");
    assert.equal(v.savingsLabel, "Você economiza R$ 24,90");
    assert.equal(v.periodLabel, "31 dias");
  });

  it("sem promoção vigente nada de desconto aparece", () => {
    const v = toPricingView(plan());
    assert.equal(v.comparePriceLabel, null);
    assert.equal(v.discountLabel, null);
    assert.equal(v.savingsLabel, null);
  });

  it("plano personalizado: 'Sob consulta', sem período, botão 'Entre em contato' com destino seguro", () => {
    const v = toPricingView(plan({ kind: "custom", code: "CUSTOM", price: null, access_duration_days: null, contact_url: "https://wa.me/5511999999999" }));
    assert.equal(v.priceLabel, "Sob consulta");
    assert.equal(v.periodLabel, null);
    assert.equal(v.ctaLabel, "Entre em contato");
    assert.equal(v.ctaHref, "https://wa.me/5511999999999");
    assert.equal(v.ctaExternal, true);
  });

  it("personalizado sem destino configurado: botão sem link (nunca um link falso) e sem cobrança", () => {
    const v = toPricingView(plan({ kind: "custom", code: "CUSTOM", price: null, access_duration_days: null }));
    assert.equal(v.ctaHref, null);
  });

  it("destino interno não é 'externo'; mailto é externo", () => {
    assert.equal(toPricingView(plan({ kind: "custom", price: null, contact_url: "/contato" })).ctaExternal, false);
    assert.equal(toPricingView(plan({ kind: "custom", price: null, contact_url: "mailto:a@b.co" })).ctaExternal, true);
  });

  it("CTA padrão: teste -> cadastro; pago -> cadastro; rótulo configurável", () => {
    assert.equal(toPricingView(plan({ kind: "trial", price: 0 })).ctaHref, "/register");
    assert.equal(toPricingView(plan({ kind: "trial", price: 0 })).priceLabel, "R$ 0");
    assert.equal(toPricingView(plan({ cta_label: "Contratar agora" })).ctaLabel, "Contratar agora");
    assert.equal(toPricingView(plan()).ctaHref, "/register");
  });

  it("linhas automáticas só prometem o que existe: usuários e suporte (tickets/grupos/acesso antecipado NÃO aparecem)", () => {
    const lines = buildPricingLines(plan());
    assert.deepEqual(lines.map((l) => l.text), ["1 proprietário + até 2 usuários adicionais", "Suporte por e-mail"]);
    assert.ok(!lines.some((l) => /ticket|grupo|antecipado/i.test(l.text)));
  });

  it("teste grátis mostra o que NÃO inclui; benefícios cadastrados vêm antes das linhas automáticas", () => {
    const lines = buildPricingLines(plan({ kind: "trial", additional_user_limit: 0, support_enabled: false, benefits: [{ text: "Conhecer o sistema", highlighted: true, included: true }] }));
    assert.deepEqual(lines, [
      { text: "Conhecer o sistema", included: true, highlighted: true },
      { text: "Usuários adicionais", included: false, highlighted: false },
      { text: "Suporte por e-mail", included: false, highlighted: false },
    ]);
  });

  it("plano sem usuários adicionais fora do teste", () => {
    assert.equal(buildPricingLines(plan({ additional_user_limit: 0, support_enabled: false }))[0].text, "1 usuário (proprietário)");
  });

  it("o texto de benefício é entregue como TEXTO (escape é do React); nada de HTML interpretado aqui", () => {
    const v = toPricingView(plan({ benefits: [{ text: "<img src=x onerror=alert(1)>", highlighted: false, included: true }] }));
    assert.equal(v.lines[0].text, "<img src=x onerror=alert(1)>");
  });

  it("formatação em reais", () => {
    assert.equal(formatPlanPrice(89), "R$ 89,00");
    assert.equal(formatPlanPrice(1234.5), "R$ 1.234,50");
  });

  it("perguntas frequentes: números vêm dos planos reais", () => {
    assert.deepEqual(faqFacts([plan({ kind: "trial", access_duration_days: 1 }), plan({ kind: "standard", additional_user_limit: 5 })]), { trialLabel: "1 dia", extraUsers: 5 });
    assert.deepEqual(faqFacts([]), { trialLabel: null, extraUsers: 0 });
  });
});

describe("normalizePublicPlan (tolerante ao formato antigo do banco e a lixo)", () => {
  it("formato ANTIGO de get_public_plans (código novo + banco ainda sem a migration) não quebra e infere o tipo", () => {
    const old = { id: "1", code: "FREE_TRIAL", name: "Teste", description: null, price: "0.00", currency: "BRL", access_duration_days: 1, additional_user_limit: 0, trial: true, support_enabled: false, tickets_enabled: false, exclusive_groups_enabled: false, early_access_enabled: false, status: "active" };
    const n = normalizePublicPlan(old);
    assert.equal(n.kind, "trial");
    assert.deepEqual(n.benefits, []);
    assert.equal(n.price, 0);
    assert.equal(n.discount_percent, null);
    assert.doesNotThrow(() => toPricingView(n));
    assert.equal(normalizePublicPlan({ ...old, code: "CUSTOM", trial: false, price: null }).kind, "custom");
  });

  it("descarta campos desconhecidos/administrativos e valores de tipo errado", () => {
    const n = normalizePublicPlan({ id: "1", code: "X", name: "X", price: "abc", provider: "evopay", provider_plan_id: "p", secret: "s", highlight: "gold", benefits: [{ text: "ok" }, { nope: 1 }, "x", null], kind: "hacker" });
    assert.ok(!("provider" in n) && !("secret" in n) && !("provider_plan_id" in n));
    assert.equal(n.price, null);
    assert.equal(n.highlight, null);
    assert.equal(n.kind, "standard");
    assert.deepEqual(n.benefits, [{ text: "ok", highlighted: false, included: true }]);
  });

  it("formato novo é preservado", () => {
    const n = normalizePublicPlan(plan({ price: 65, compare_price: 89.9, discount_percent: 27.7, savings_amount: 24.9, tagline: "Oferta", highlight: "popular", benefits: [{ text: "B", highlighted: true, included: false }] }));
    assert.equal(n.discount_percent, 27.7);
    assert.equal(n.highlight, "popular");
    assert.deepEqual(n.benefits, [{ text: "B", highlighted: true, included: false }]);
  });
});
