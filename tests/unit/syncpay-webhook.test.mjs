import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SIGNATURE_TOLERANCE_SECONDS, SYNCPAY_STATUSES, mapSyncPayStatus, minimizeEvent, parseTransactionEvent, paymentIdFromDescription, verifySignature } from "../../src/lib/syncpay/webhook.ts";
import { buildBuyer, buildCardIframeUrl, incompleteProfileMessage, isCardToken, normalizeBrPhone, siteOrigin } from "../../src/lib/billing/buyer.ts";

/**
 * Contrato da SyncPay conforme a DOCUMENTAÇÃO OFICIAL (https://docs.syncpayments.com.br, lida em 2026-11-21):
 *  - webhook `transaction`: X-SyncPay-Signature = `t=<unix>,v1=<hmac-sha256 hex de "{t}.{corpo cru}">`, janela de 5 min;
 *  - corpo: event, event_id (dedup), occurred_at, transaction{reference_id, status, previous_status, payment_method, amount (bruto), ...};
 *  - status: pending, completed, failed, refused, three_ds_failed, refunding, refunded, chargeback, med; libera SÓ em completed.
 * Os objetos abaixo reproduzem a estrutura da doc com dados FICTÍCIOS. Não são entregas reais.
 */
const SECRET = "whsec_FAKE_NOT_REAL";
const NOW_MS = Date.UTC(2026, 10, 21, 20, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const sign = (body, t = NOW_S, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

const PAYMENT_ID = "0b54f92a-ec10-46cb-9762-0e84d759cce2";
const docEvent = (patch = {}, txPatch = {}) => ({
  event: "transaction.updated",
  event_id: "evt_01HZ",
  occurred_at: "2026-11-21T19:59:30Z",
  api_version: "2026-11",
  transaction: {
    reference_id: "9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31",
    status: "completed",
    previous_status: "pending",
    payment_method: "pix",
    origin: "api",
    description: `Prime Ges MONTHLY PRIMEGES:${PAYMENT_ID}`,
    currency: "BRL",
    amount: 89,
    net_amount: 87.2,
    refused_reason: null,
    end_to_end_id: "E18236120202611211432s0123456789",
    created_at: "2026-11-21T19:55:00Z",
    paid_at: "2026-11-21T19:59:29Z",
    customer: { reference_id: "c1", name: "Fulano da Silva", email: "fulano@email.com", document: "12345678909", phone: "+5511999998888" },
    debtor_account: { name: "FULANO DA SILVA", document: "***.456.789-**", issuer: "NU PAGAMENTOS S.A.", account_type: "CACC" },
    payment: { pix: { code: "00020126580014BR.GOV.BCB.PIX0136..." }, card: null },
    ...txPatch,
  },
  ...patch,
});

describe("assinatura do webhook (HMAC-SHA256 de t.corpo)", () => {
  const body = JSON.stringify(docEvent());

  it("aceita a assinatura correta", () => {
    assert.deepEqual(verifySignature(sign(body), body, SECRET, NOW_MS), { ok: true });
  });

  it("recusa corpo alterado em 1 caractere, segredo errado e timestamp trocado", () => {
    assert.equal(verifySignature(sign(body), body.replace("89", "88"), SECRET, NOW_MS).ok, false);
    assert.equal(verifySignature(sign(body, NOW_S, "outro-segredo"), body, SECRET, NOW_MS).ok, false);
    const header = sign(body);
    const replayed = header.replace(`t=${NOW_S}`, `t=${NOW_S + 1}`);
    assert.equal(verifySignature(replayed, body, SECRET, NOW_MS).ok, false);
  });

  it("usa o corpo CRU: o mesmo JSON com espaço diferente NÃO confere", () => {
    const pretty = JSON.stringify(docEvent(), null, 2);
    assert.equal(verifySignature(sign(body), pretty, SECRET, NOW_MS).ok, false);
  });

  it("janela de 5 minutos: dentro passa, fora (passado ou futuro) é 'stale'", () => {
    assert.equal(SIGNATURE_TOLERANCE_SECONDS, 300);
    assert.equal(verifySignature(sign(body, NOW_S - 299), body, SECRET, NOW_MS).ok, true);
    assert.deepEqual(verifySignature(sign(body, NOW_S - 301), body, SECRET, NOW_MS), { ok: false, reason: "stale" });
    assert.deepEqual(verifySignature(sign(body, NOW_S + 301), body, SECRET, NOW_MS), { ok: false, reason: "stale" });
  });

  it("cabeçalho ausente, vazio ou malformado é recusado sem lançar erro", () => {
    for (const bad of [null, undefined, "", "lixo", "t=abc,v1=zz", `t=${NOW_S}`, `v1=${"a".repeat(64)}`, `t=${NOW_S},v1=curto`]) {
      const r = verifySignature(bad, body, SECRET, NOW_MS);
      assert.equal(r.ok, false, String(bad));
    }
  });

  it("sem segredo configurado nada é aceito (nem uma assinatura 'vazia')", () => {
    assert.equal(verifySignature(sign(body, NOW_S, ""), body, "", NOW_MS).ok, false);
  });

  it("aceita se QUALQUER v1 do cabeçalho confere (rotação de segredo)", () => {
    const good = sign(body).split(",v1=")[1];
    const header = `t=${NOW_S},v1=${"0".repeat(64)},v1=${good}`;
    assert.equal(verifySignature(header, body, SECRET, NOW_MS).ok, true);
  });
});

describe("leitura do evento transaction.*", () => {
  it("lê o evento da documentação (campos usados)", () => {
    const r = parseTransactionEvent(docEvent());
    assert.equal(r.ok, true);
    assert.deepEqual(r.event, {
      event: "transaction.updated",
      eventId: "evt_01HZ",
      occurredAt: "2026-11-21T19:59:30Z",
      referenceId: "9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31",
      status: "completed",
      previousStatus: "pending",
      paymentMethod: "pix",
      amount: 89,
      netAmount: 87.2,
      description: `Prime Ges MONTHLY PRIMEGES:${PAYMENT_ID}`,
      endToEndId: "E18236120202611211432s0123456789",
      paidAt: "2026-11-21T19:59:29Z",
    });
  });

  it("transaction.created também vale; amount em texto vira número", () => {
    const r = parseTransactionEvent(docEvent({ event: "transaction.created" }, { amount: "89.00" }));
    assert.equal(r.ok, true);
    assert.equal(r.event.amount, 89);
  });

  it("recusa o que não é o contrato: teste do painel, outro evento, sem event_id, sem referência, status desconhecido", () => {
    assert.deepEqual(parseTransactionEvent({ test: true }), { ok: false, reason: "test" });
    assert.deepEqual(parseTransactionEvent(docEvent({ event: "cashin.updated" })), { ok: false, reason: "unsupported_event" });
    assert.deepEqual(parseTransactionEvent(docEvent({ event_id: "" })), { ok: false, reason: "no_event_id" });
    assert.deepEqual(parseTransactionEvent(docEvent({}, { reference_id: null })), { ok: false, reason: "no_reference" });
    assert.deepEqual(parseTransactionEvent(docEvent({ transaction: null })), { ok: false, reason: "no_reference" });
    assert.deepEqual(parseTransactionEvent(docEvent({}, { status: "approved" })), { ok: false, reason: "unknown_status" });
    for (const bad of [null, undefined, 1, "x", []]) assert.equal(parseTransactionEvent(bad).ok, false);
  });

  it("amount ausente/ilegível vira null (o banco recusa um 'paid' sem valor)", () => {
    assert.equal(parseTransactionEvent(docEvent({}, { amount: null })).event.amount, null);
    assert.equal(parseTransactionEvent(docEvent({}, { amount: "abc" })).event.amount, null);
  });
});

describe("status da SyncPay → status interno", () => {
  it("os 9 status documentados", () => {
    assert.deepEqual(SYNCPAY_STATUSES, ["pending", "completed", "failed", "refused", "three_ds_failed", "refunding", "refunded", "chargeback", "med"]);
    const expected = { pending: "pending", completed: "paid", failed: "failed", refused: "failed", three_ds_failed: "failed", refunding: null, med: null, refunded: "refunded", chargeback: "refunded" };
    for (const s of SYNCPAY_STATUSES) assert.equal(mapSyncPayStatus(s), expected[s], s);
  });

  it("SÓ 'completed' vira pago (refunding e med, mesmo fora de ordem, nunca concedem acesso)", () => {
    const paid = SYNCPAY_STATUSES.filter((s) => mapSyncPayStatus(s) === "paid");
    assert.deepEqual(paid, ["completed"]);
  });

  it("valor desconhecido, maiúsculo ou nulo NÃO vira pago (null = ignorar)", () => {
    for (const bad of ["COMPLETED", "approved", "paid", "", null, undefined, 1, {}, "completed "]) assert.equal(mapSyncPayStatus(bad), null, String(bad));
  });
});

describe("minimização de dados (LGPD)", () => {
  it("o que vai para payment_events não tem nome, e-mail, documento, telefone, conta pagadora nem Pix", () => {
    const parsed = parseTransactionEvent(docEvent());
    const payload = JSON.stringify(minimizeEvent(parsed.event));
    for (const secret of ["Fulano", "fulano@email.com", "12345678909", "5511999998888", "FULANO DA SILVA", "NU PAGAMENTOS", "BR.GOV.BCB.PIX"]) {
      assert.equal(payload.includes(secret), false, secret);
    }
    assert.match(payload, /9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31/);
    assert.match(payload, /"status":"completed"/);
  });
});

describe("vínculo com o pagamento interno pela descrição", () => {
  it("acha o uuid de PRIMEGES:<uuid> em qualquer lugar da descrição, em minúsculas", () => {
    assert.equal(paymentIdFromDescription(`Prime Ges MONTHLY PRIMEGES:${PAYMENT_ID}`), PAYMENT_ID);
    assert.equal(paymentIdFromDescription(`PRIMEGES:${PAYMENT_ID.toUpperCase()}`), PAYMENT_ID);
  });
  it("sem referência válida devolve null", () => {
    for (const bad of [null, undefined, "", "Pedido 123", "PRIMEGES:123", "PRIMEGES:", "OUTRO:" + PAYMENT_ID]) assert.equal(paymentIdFromDescription(bad), null, String(bad));
  });
});

describe("dados do comprador exigidos pela SyncPay", () => {
  const base = { companyName: "Oficina do Zé", legalName: "José da Silva ME", document: "52998224725", phone: null, whatsapp: "(11) 99999-8888", companyEmail: null, userEmail: "Ze@Oficina.com" };

  it("monta o comprador: nome jurídico, CPF só dígitos, e-mail minúsculo, telefone sem 55", () => {
    const r = buildBuyer(base);
    assert.equal(r.ok, true);
    assert.deepEqual(r.buyer, { name: "José da Silva ME", document: "52998224725", email: "ze@oficina.com", phone: "11999998888" });
  });

  it("aceita CNPJ válido formatado e telefone fixo; prefere o WhatsApp mas cai no telefone", () => {
    const r = buildBuyer({ ...base, document: "11.222.333/0001-81", whatsapp: null, phone: "+55 11 3333-4444", legalName: null });
    assert.equal(r.ok, true);
    assert.equal(r.buyer.document, "11222333000181");
    assert.equal(r.buyer.phone, "1133334444");
    assert.equal(r.buyer.name, "Oficina do Zé");
  });

  it("lista o que falta: documento inválido, sem telefone, sem e-mail", () => {
    assert.deepEqual(buildBuyer({ ...base, document: "111.111.111-11" }).missing, ["documento"]);
    assert.deepEqual(buildBuyer({ ...base, document: "123" }).missing, ["documento"]);
    assert.deepEqual(buildBuyer({ ...base, document: null }).missing, ["documento"]);
    assert.deepEqual(buildBuyer({ ...base, whatsapp: null, phone: null }).missing, ["telefone"]);
    assert.deepEqual(buildBuyer({ ...base, userEmail: null, companyEmail: "invalido" }).missing, ["e-mail"]);
    assert.deepEqual(buildBuyer({ companyName: "", legalName: "", document: "", phone: "", whatsapp: "", companyEmail: "", userEmail: "" }).missing, ["nome", "documento", "telefone", "e-mail"]);
  });

  it("a mensagem para o usuário aponta onde corrigir e não repete os dados", () => {
    const text = incompleteProfileMessage(["documento", "telefone"]);
    assert.match(text, /Configurações → Empresa/);
    assert.match(text, /documento, telefone/);
  });

  it("telefone: só DDD+número (10 ou 11 dígitos), sem 55; DDD inválido e repetidos são recusados", () => {
    assert.equal(normalizeBrPhone("(11) 99999-8888"), "11999998888");
    assert.equal(normalizeBrPhone("+55 (21) 3333-4444"), "2133334444");
    assert.equal(normalizeBrPhone("5511999998888"), "11999998888");
    for (const bad of ["", null, "123", "00999998888", "11111111111", "119999988889999"]) assert.equal(normalizeBrPhone(bad), null, String(bad));
  });
});

describe("iFrame de cartão (montado no servidor)", () => {
  it("amount em CENTAVOS e parent_origin sem caminho nem barra", () => {
    const url = buildCardIframeUrl({ publicKey: "pk_live_abc123", amountReais: 89.9, parentOrigin: "https://primeges.com.br" });
    assert.equal(url, "https://app.syncpayments.com.br/embed/pk_live_abc123?amount=8990&parent_origin=https%3A%2F%2Fprimeges.com.br");
  });
  it("recusa valor fora de 1,00..999.999,99 e chave que não é pk_live_", () => {
    assert.equal(buildCardIframeUrl({ publicKey: "pk_live_abc", amountReais: 0.5, parentOrigin: "https://x.com" }), null);
    assert.equal(buildCardIframeUrl({ publicKey: "pk_live_abc", amountReais: 1_000_000, parentOrigin: "https://x.com" }), null);
    assert.equal(buildCardIframeUrl({ publicKey: "sk_live_abc", amountReais: 89, parentOrigin: "https://x.com" }), null);
    assert.equal(buildCardIframeUrl({ publicKey: "pk_live_a b", amountReais: 89, parentOrigin: "https://x.com" }), null);
  });
  it("siteOrigin devolve só esquema+host", () => {
    assert.equal(siteOrigin("https://primeges.com.br/qualquer/coisa?x=1"), "https://primeges.com.br");
    assert.equal(siteOrigin("http://localhost:3000/"), "http://localhost:3000");
    assert.equal(siteOrigin("ftp://x.com"), null);
    assert.equal(siteOrigin("não é url"), null);
  });
  it("token de cartão: card_token. + conteúdo opaco; nada de apple_pay, HTML ou tamanho absurdo", () => {
    assert.equal(isCardToken("card_token.yV5IhEG7gIUgHyKnUTE2Uozams0JpjCpbc5it3NG-nw"), true);
    for (const bad of ["", "apple_pay_token.abcdefghij", "card_token.", "card_token.<script>", "card_token.curto", `card_token.${"a".repeat(2100)}`, null, 123, {}]) assert.equal(isCardToken(bad), false, String(bad));
  });
});

describe("fiação: o webhook e as rotas seguem as regras da SyncPay (leitura do código)", () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  const webhook = read("src/app/api/webhooks/syncpay/route.ts");
  const payCard = read("src/app/api/billing/pay-card/route.ts");
  const create = read("src/app/api/billing/create-payment/route.ts");

  it("webhook: confere a assinatura sobre o corpo CRU antes de interpretar e recusa sem segredo", () => {
    assert.ok(webhook.indexOf("request.text()") < webhook.indexOf("verifySignature("));
    assert.ok(webhook.indexOf("verifySignature(") < webhook.indexOf("JSON.parse(rawBody)"));
    assert.match(webhook, /SYNCPAY_WEBHOOK_SECRET/);
    assert.match(webhook, /status: 401/);
    assert.match(webhook, /status: 503/);
  });
  it("webhook: deduplica pelo event_id e não consulta o provedor a cada entrega", () => {
    assert.match(webhook, /eventId: event\.eventId/);
    assert.doesNotMatch(webhook, /getTransaction|confirmPaymentFromProvider/);
  });
  it("cartão: reserva a tentativa no banco ANTES de chamar a SyncPay e nunca retenta depois de 200/5xx/timeout", () => {
    assert.ok(payCard.indexOf("card_submitted_at: new Date()") < payCard.indexOf("createCardCharge("));
    assert.match(payCard, /\.is\("card_submitted_at", null\)/);
    assert.match(payCard, /PAYMENT_UNKNOWN/);
    assert.match(payCard, /error\.status === 409/);
  });
  it("cartão: o valor vem do pagamento salvo, não do corpo da requisição", () => {
    assert.match(payCard, /amount: Number\(payment\.amount\)/);
    assert.doesNotMatch(payCard, /parsed\.data\.amount/);
  });
  it("Pix e cartão exigem o cadastro da empresa completo e só proprietário/admin pagam", () => {
    for (const code of [create, payCard]) {
      assert.match(code, /BILLING_PROFILE_INCOMPLETE/);
      assert.match(code, /current\.role !== "owner" && current\.role !== "admin"/);
    }
  });
  it("nenhum arquivo do app ainda importa a EvoPay", () => {
    for (const p of ["src/lib/billing/confirm-payment.ts", "src/app/api/billing/create-payment/route.ts", "src/app/api/webhooks/syncpay/route.ts"]) assert.doesNotMatch(read(p), /lib\/evopay|EVOPAY_/);
  });
});
