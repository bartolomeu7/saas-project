import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildWebhookUrl, mapMisticPayStatus, MIN_WEBHOOK_TOKEN_LENGTH, parseDepositNotice, paymentIdFromNotice, verifyWebhookToken } from "../../src/lib/misticpay/webhook.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";

describe("webhook MisticPay: token da URL (a MisticPay não assina os webhooks)", () => {
  it("aceita o token exato", () => {
    assert.deepEqual(verifyWebhookToken(TOKEN, TOKEN), { ok: true });
  });
  it("recusa token ausente, vazio, diferente, com um caractere a mais ou a menos", () => {
    assert.equal(verifyWebhookToken(null, TOKEN).ok, false);
    assert.equal(verifyWebhookToken("", TOKEN).ok, false);
    assert.equal(verifyWebhookToken(TOKEN + "x", TOKEN).ok, false);
    assert.equal(verifyWebhookToken(TOKEN.slice(0, -1), TOKEN).ok, false);
    assert.equal(verifyWebhookToken(TOKEN.replace("a", "b"), TOKEN).ok, false);
  });
  it("sem token esperado configurado nada passa (nem string vazia contra vazia)", () => {
    assert.equal(verifyWebhookToken("", "").ok, false);
    assert.equal(verifyWebhookToken("x", "").ok, false);
  });
  it("monta a URL do webhook só com token forte e origem válida", () => {
    assert.equal(buildWebhookUrl("https://primeges.com.br", TOKEN), `https://primeges.com.br/api/webhooks/misticpay?token=${TOKEN}`);
    assert.equal(buildWebhookUrl("https://primeges.com.br", "curto"), null);
    assert.equal(buildWebhookUrl("https://primeges.com.br", undefined), null);
    assert.equal(buildWebhookUrl(null, TOKEN), null);
    assert.equal(buildWebhookUrl("https://primeges.com.br", "a".repeat(MIN_WEBHOOK_TOKEN_LENGTH - 1)), null);
    assert.equal(buildWebhookUrl("https://primeges.com.br", `${TOKEN}&x=1`), null, "caracteres de URL não entram no token");
  });
});

describe("webhook MisticPay: estados e avisos", () => {
  it("só COMPLETO é pago; estados desconhecidos e estorno parcial nunca viram pago", () => {
    assert.equal(mapMisticPayStatus("COMPLETO"), "paid");
    assert.equal(mapMisticPayStatus("PENDENTE"), "pending");
    assert.equal(mapMisticPayStatus("FALHA"), "failed");
    assert.equal(mapMisticPayStatus("CANCELADO"), "cancelled");
    assert.equal(mapMisticPayStatus("DEVOLVIDO"), "refunded");
    assert.equal(mapMisticPayStatus("DEVOLVIDO_PARCIAL"), null);
    for (const v of ["completo", "PAGO", "", null, undefined, 1, {}]) assert.equal(mapMisticPayStatus(v), null, String(v));
  });

  it("lê o aviso de depósito da documentação (id numérico) e o de reembolso (id nosso)", () => {
    const deposito = parseDepositNotice({ transactionId: 31484480, transactionType: "DEPOSITO", transactionMethod: "PIX", status: "COMPLETO", value: 455, fee: 23, e2e: "E1" });
    assert.deepEqual(deposito, { ok: true, notice: { transactionId: "31484480", status: "COMPLETO" } });
    const reembolso = parseDepositNotice({ transactionId: "pedido-123", transactionType: "DEPOSITO", status: "DEVOLVIDO", refund: { status: "CONCLUIDO" } });
    assert.deepEqual(reembolso, { ok: true, notice: { transactionId: "pedido-123", status: "DEVOLVIDO" } });
  });

  it("recusa saque, infração MED, corpo que não é objeto e aviso sem transactionId", () => {
    assert.deepEqual(parseDepositNotice({ transactionId: 1, transactionType: "RETIRADA", status: "COMPLETO" }), { ok: false, reason: "not_deposit" });
    assert.deepEqual(parseDepositNotice({ event: "INFRACTION", infraction: { id: 1 }, transaction: { transactionId: "x" } }), { ok: false, reason: "med" });
    assert.deepEqual(parseDepositNotice({ transactionType: "DEPOSITO", status: "COMPLETO" }), { ok: false, reason: "no_transaction" });
    for (const body of [null, undefined, "x", 3, [], [{ transactionType: "DEPOSITO" }]]) assert.equal(parseDepositNotice(body).ok, false);
  });

  it("o valor e os dados pessoais do aviso NÃO são lidos (o valor vem da consulta; a LGPD fica em dia)", () => {
    const parsed = parseDepositNotice({ transactionId: 5, transactionType: "DEPOSITO", status: "COMPLETO", value: 1, clientName: "Fulano", clientDocument: "52998224725" });
    assert.deepEqual(Object.keys(parsed.notice).sort(), ["status", "transactionId"]);
  });

  it("reconhece o id do pagamento (UUID) citado pelo aviso", () => {
    assert.equal(paymentIdFromNotice("11111111-2222-3333-4444-555555555555"), "11111111-2222-3333-4444-555555555555");
    assert.equal(paymentIdFromNotice("AAAAAAAA-2222-3333-4444-555555555555"), "aaaaaaaa-2222-3333-4444-555555555555");
    assert.equal(paymentIdFromNotice("31484480"), null);
    assert.equal(paymentIdFromNotice("pedido-123"), null);
  });
});

describe("webhook MisticPay: a rota nunca confia no corpo", () => {
  const route = read("src/app/api/webhooks/misticpay/route.ts");

  it("confere o token ANTES de ler o corpo e responde 503 sem token configurado", () => {
    assert.ok(route.indexOf("verifyWebhookToken") < route.indexOf("request.text()"));
    assert.match(route, /MIN_WEBHOOK_TOKEN_LENGTH/);
    assert.match(route, /status: 503/);
    assert.match(route, /status: 401/);
  });

  it("quem decide é a consulta à MisticPay (verifyMisticPayment), não o status nem o valor do corpo", () => {
    assert.match(route, /verifyMisticPayment\(paymentId\)/);
    assert.equal(/applyProviderUpdate/.test(route), false, "a rota não aplica status vindo do corpo");
    assert.equal(/notice\.status|\.value\b/.test(route), false);
  });

  it("falha transitória devolve 503 para a MisticPay tentar de novo", () => {
    assert.match(route, /if \(transient\) return NextResponse\.json\(\{ error: "Tente novamente\." \}, \{ status: 503 \}\)/);
  });

  it("guarda só resultado e id externo na entrega (nunca o corpo)", () => {
    assert.equal(/rawBody|request\.text\(\)\s*[,;]\s*\n\s*provider/.test(route), false);
    assert.match(route, /provider: "misticpay"/);
  });
});

describe("consulta MisticPay: regras do servidor", () => {
  const confirm = read("src/lib/billing/confirm-payment.ts");

  it("só concede quando o estado mapeia para pago e o valor vem da consulta", () => {
    assert.match(confirm, /mapMisticPayStatus\(snapshot\.state\)/);
    assert.match(confirm, /amount: snapshot\.value/);
  });

  it("transação que não é depósito é recusada", () => {
    assert.match(confirm, /snapshot\.type !== "DEPOSITO"/);
  });

  it("tenta o identificador da criação e, se for 404, o nosso", () => {
    assert.match(confirm, /checkTransaction\(providerId\)/);
    assert.match(confirm, /error\.status !== 404/);
    assert.match(confirm, /checkTransaction\(payment\.id\)/);
  });

  it("evento idempotente por transação + estado", () => {
    assert.match(confirm, /eventId: `\$\{providerId\}:\$\{snapshot\.state\}`/);
  });
});
