import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONSENT_REQUIRED_CODE, decideConsentGate, isConsentGatedPath } from "../../src/lib/legal/gate.ts";

const base = { method: "GET", isServerAction: false };

describe("rotas protegidas pela barreira de consentimento", () => {
  it("cobre o produto autenticado e a API de cobrança", () => {
    for (const p of ["/app", "/app/clientes", "/app/assinatura/pagamento/abc", "/onboarding", "/admin", "/admin/users", "/api/billing/create-payment"]) {
      assert.equal(isConsentGatedPath(p), true, p);
    }
  });

  it("NÃO cobre páginas públicas/legais, o próprio aceite, login, webhook e presença", () => {
    for (const p of ["/", "/login", "/register", "/termos-de-uso", "/politica-de-privacidade", "/aceite-termos", "/api/webhooks/evopay", "/api/presence", "/application", "/administrator", "/api/billing-x"]) {
      assert.equal(isConsentGatedPath(p), false, p);
    }
  });
});

describe("decisão da barreira de consentimento", () => {
  it("consentimento completo libera tudo", () => {
    for (const pathname of ["/app", "/admin/users", "/api/billing/create-payment"]) {
      assert.deepEqual(decideConsentGate({ ...base, pathname, complete: true }), { action: "allow" });
    }
  });

  it("rota fora da barreira nunca é bloqueada, mesmo sem consentimento", () => {
    for (const pathname of ["/", "/aceite-termos", "/termos-de-uso", "/api/webhooks/evopay"]) {
      assert.deepEqual(decideConsentGate({ ...base, pathname, complete: false }), { action: "allow" }, pathname);
    }
  });

  it("página (GET/HEAD) sem consentimento redireciona levando o destino original", () => {
    assert.deepEqual(decideConsentGate({ ...base, pathname: "/app/clientes", search: "?q=ana", complete: false }), { action: "redirect", from: "/app/clientes?q=ana" });
    assert.deepEqual(decideConsentGate({ ...base, method: "HEAD", pathname: "/admin", complete: false }), { action: "redirect", from: "/admin" });
  });

  it("Server Action, POST/PUT/DELETE e API sem consentimento são NEGADOS (nunca redirecionados)", () => {
    assert.deepEqual(decideConsentGate({ method: "POST", isServerAction: true, pathname: "/app/clientes", complete: false }), { action: "deny" });
    assert.deepEqual(decideConsentGate({ method: "POST", isServerAction: false, pathname: "/app/clientes", complete: false }), { action: "deny" });
    assert.deepEqual(decideConsentGate({ method: "DELETE", isServerAction: false, pathname: "/app/x", complete: false }), { action: "deny" });
    assert.deepEqual(decideConsentGate({ ...base, pathname: "/api/billing/create-payment", complete: false }), { action: "deny" });
    assert.deepEqual(decideConsentGate({ method: "post", isServerAction: false, pathname: "/api/billing/create-payment", complete: false }), { action: "deny" });
  });

  it("status ausente, nulo ou malformado conta como PENDENTE (falha fechada)", () => {
    for (const complete of [false, undefined, null, "true", 1, 0, {}, []]) {
      const decision = decideConsentGate({ ...base, pathname: "/app", complete });
      assert.notEqual(decision.action, "allow", String(JSON.stringify(complete)));
    }
  });

  it("o código de erro é estável para o cliente tratar", () => {
    assert.equal(CONSENT_REQUIRED_CODE, "LEGAL_CONSENT_REQUIRED");
  });
});

import { evaluateLegalIntegrity } from "../../src/lib/legal/integrity.ts";
import { termsOfUse } from "../../src/content/legal/terms-of-use.ts";
import { privacyPolicy } from "../../src/content/legal/privacy-policy.ts";
import { hashLegalDocument } from "../../src/lib/legal/hash.ts";

describe("integridade texto do repositório × versão publicada", () => {
  const code = {
    terms: { version: termsOfUse.version, hash: hashLegalDocument(termsOfUse) },
    privacy: { version: privacyPolicy.version, hash: hashLegalDocument(privacyPolicy) },
  };
  const published = [
    { document_type: "TERMS_OF_USE", version: code.terms.version, content_hash: code.terms.hash },
    { document_type: "PRIVACY_POLICY", version: code.privacy.version, content_hash: code.privacy.hash },
  ];

  it("OK quando versão e hash batem nos dois documentos", () => {
    assert.equal(evaluateLegalIntegrity(published, code), "OK");
  });

  it("MISMATCH com hash inválido (texto mudou sem nova versão)", () => {
    const bad = published.map((r) => (r.document_type === "TERMS_OF_USE" ? { ...r, content_hash: "0".repeat(64) } : r));
    assert.equal(evaluateLegalIntegrity(bad, code), "MISMATCH");
  });

  it("MISMATCH quando o banco já vigora outra versão (documento antigo/aposentado no código)", () => {
    const newer = published.map((r) => ({ ...r, version: "1.0.0-rc.3" }));
    assert.equal(evaluateLegalIntegrity(newer, code), "MISMATCH");
    const olderInDb = published.map((r) => ({ ...r, version: "1.0.0-rc.1" }));
    assert.equal(evaluateLegalIntegrity(olderInDb, code), "MISMATCH");
  });

  it("MISMATCH se só a Política diverge (os dois precisam bater)", () => {
    const bad = published.map((r) => (r.document_type === "PRIVACY_POLICY" ? { ...r, content_hash: "f".repeat(64) } : r));
    assert.equal(evaluateLegalIntegrity(bad, code), "MISMATCH");
  });

  it("UNAVAILABLE sem um dos documentos, vazio ou nulo (nunca 'OK')", () => {
    assert.equal(evaluateLegalIntegrity([published[0]], code), "UNAVAILABLE");
    assert.equal(evaluateLegalIntegrity([], code), "UNAVAILABLE");
    assert.equal(evaluateLegalIntegrity(null, code), "UNAVAILABLE");
    assert.equal(evaluateLegalIntegrity(undefined, code), "UNAVAILABLE");
  });
});
