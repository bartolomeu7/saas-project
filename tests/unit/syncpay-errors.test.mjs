import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MAX_PROVIDER_NOTE, providerFailureNote, safeProviderMessage } from "../../src/lib/syncpay/errors.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("motivo da recusa da SyncPay (log e observações do pagamento)", () => {
  it("guarda a mensagem técnica útil, como a do Pix não habilitado", () => {
    assert.equal(safeProviderMessage("Permission 'pix_enabled' is not granted for this user."), "Permission 'pix_enabled' is not granted for this user.");
    assert.equal(providerFailureNote(500, "Permission 'pix_enabled' is not granted for this user."), "Provedor recusou (HTTP 500): Permission 'pix_enabled' is not granted for this user.");
  });

  it("mascara CPF, CNPJ, telefone, cartão e e-mail que o provedor repetir", () => {
    const text = safeProviderMessage("Documento 529.982.247-25 inválido; cnpj 11.222.333/0001-81; fone (11) 99999-8888; cartão 4111 1111 1111 1111; ze@oficina.com.br");
    for (const pii of ["529.982", "11.222.333", "99999-8888", "4111", "ze@oficina"]) assert.equal(text.includes(pii), false, pii);
    assert.match(text, /\[número\]/);
    assert.match(text, /\[e-mail\]/);
  });

  it("tira caracteres de controle e quebras de linha, e limita o tamanho", () => {
    const text = safeProviderMessage(`linha1\n\tlinha2\u0000${"x".repeat(1000)}`);
    assert.equal(/[\u0000-\u001f]/.test(text), false);
    assert.ok(text.length <= MAX_PROVIDER_NOTE);
    assert.match(text, /^linha1 linha2/);
  });

  it("sem resposta (status 0) e mensagem ausente ou de tipo errado não quebram", () => {
    assert.equal(providerFailureNote(0, "x"), "Sem resposta do provedor (rede ou tempo esgotado): x");
    assert.equal(providerFailureNote(500, undefined), "Provedor recusou (HTTP 500).");
    assert.equal(providerFailureNote(422, { message: "objeto" }), "Provedor recusou (HTTP 422).");
    assert.equal(safeProviderMessage(null), "");
  });

  it("as rotas registram o motivo e a falha de Pix fica nas observações do pagamento", () => {
    const create = read("src/app/api/billing/create-payment/route.ts");
    const card = read("src/app/api/billing/pay-card/route.ts");
    assert.match(create, /providerFailureNote\(error\.status, error\.message\)/);
    assert.match(create, /status: "failed", notes: note/);
    assert.match(card, /providerFailureNote\(error\.status, error\.message\)/);
  });
});
