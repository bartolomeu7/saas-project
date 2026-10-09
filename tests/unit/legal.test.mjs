import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { termsOfUse } from "../../src/content/legal/terms-of-use.ts";
import { privacyPolicy } from "../../src/content/legal/privacy-policy.ts";
import { canonicalLegalContent, hashLegalDocument } from "../../src/lib/legal/hash.ts";
import {
  SIGNUP_INTENT_TTL_SECONDS,
  createSignupIntent,
  intentMatchesNewUser,
  verifySignupIntent,
} from "../../src/lib/legal/signup-intent.ts";
import { safeAfterConsentPath } from "../../src/lib/legal/safe-path.ts";

const DOCS = [termsOfUse, privacyPolicy];
const SECRET = "sk_test_unit_secret";
const VERSIONS = { terms: "1.0.0-rc.2", privacy: "1.0.0-rc.2" };
const MIGRATION = ["20261010000000_legal_consent.sql", "20261010000100_legal_rc2.sql"]
  .map((name) => readFileSync(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8"))
  .join("\n");

function markersOf(doc) {
  const text = doc.sections.flatMap((s) => [...s.paragraphs, ...(s.items ?? [])]).join("\n");
  return text.match(/\[[^\]]*\]/g) ?? [];
}

describe("conteúdo dos documentos legais", () => {
  it("tem tipo, versão, vigência e seções únicas e não vazias", () => {
    for (const doc of DOCS) {
      assert.match(doc.version, /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/);
      assert.match(doc.effectiveAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(doc.sections.length >= 10, doc.type + " tem seções suficientes");
      const ids = doc.sections.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, "ids de seção únicos em " + doc.type);
      for (const section of doc.sections) {
        assert.ok(section.title.trim().length > 0 && section.paragraphs.length > 0, section.id);
      }
    }
    assert.equal(termsOfUse.type, "TERMS_OF_USE");
    assert.equal(privacyPolicy.type, "PRIVACY_POLICY");
  });

  it("só usa marcadores controlados entre colchetes (nada solto ou inventado)", () => {
    const allowed = /^\[(BLOCKED — DADO EMPRESARIAL NECESSÁRIO|VALIDAÇÃO JURÍDICA NECESSÁRIA)\]$/;
    for (const doc of DOCS) {
      for (const marker of markersOf(doc)) assert.match(marker, allowed, marker);
    }
  });

  it("não afirma conformidade absoluta com a LGPD", () => {
    for (const doc of DOCS) {
      const text = JSON.stringify(doc.sections).toLowerCase();
      assert.ok(!text.includes("100% em conformidade"), doc.type);
      assert.ok(!text.includes("totalmente em conformidade"), doc.type);
    }
  });

  it("os dados da empresa ainda não fornecidos aparecem como BLOCKED, nunca inventados", () => {
    const text = JSON.stringify(termsOfUse.sections);
    assert.ok(text.includes("Razão social: [BLOCKED"));
    assert.ok(!/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(JSON.stringify(DOCS)), "nenhum CNPJ no texto");
  });

  it("(opcional, pré-Production) LEGAL_REQUIRE_PUBLISHABLE=1 exige zero marcadores pendentes", (t) => {
    if (process.env.LEGAL_REQUIRE_PUBLISHABLE !== "1") {
      t.skip("rode com LEGAL_REQUIRE_PUBLISHABLE=1 antes de promover para Production");
      return;
    }
    for (const doc of DOCS) assert.deepEqual(markersOf(doc), [], doc.type + " ainda tem pendências");
  });
});

describe("hash dos documentos (integridade do texto publicado)", () => {
  it("é SHA-256 hexadecimal e determinístico", () => {
    for (const doc of DOCS) {
      const h = hashLegalDocument(doc);
      assert.match(h, /^[0-9a-f]{64}$/);
      assert.equal(h, hashLegalDocument(structuredClone(doc)));
    }
    assert.notEqual(hashLegalDocument(termsOfUse), hashLegalDocument(privacyPolicy));
  });

  it("qualquer mudança no texto, versão ou vigência muda o hash", () => {
    const base = hashLegalDocument(termsOfUse);
    const edited = structuredClone(termsOfUse);
    edited.sections[0].paragraphs[0] += " ";
    assert.notEqual(hashLegalDocument(edited), base);
    assert.notEqual(hashLegalDocument({ ...termsOfUse, version: "1.0.1" }), base);
    assert.notEqual(hashLegalDocument({ ...termsOfUse, effectiveAt: "2026-10-09" }), base);
  });

  it("o resumo da página NÃO faz parte do hash (só o texto publicado)", () => {
    assert.equal(hashLegalDocument({ ...termsOfUse, summary: "outro resumo" }), hashLegalDocument(termsOfUse));
    assert.ok(!canonicalLegalContent(termsOfUse).includes(termsOfUse.summary));
  });

  it("T12: o hash registrado na migration é exatamente o do texto do repositório", () => {
    for (const doc of DOCS) {
      const row = new RegExp(`\\('${doc.type}', '${doc.version.replace(/\./g, "\\.")}', '[^']+', '([0-9a-f]{64})', 'published'\\)`);
      const match = MIGRATION.match(row);
      assert.ok(match, "linha de seed de " + doc.type + " " + doc.version + " na migration");
      assert.equal(match[1], hashLegalDocument(doc), "hash de " + doc.type + " diverge do texto: publique nova versão");
    }
  });
});

describe("intenção de aceite do cadastro (cookie assinado)", () => {
  const now = 1_800_000_000_000;

  it("ida e volta: o servidor reconhece o token que ele mesmo emitiu", () => {
    const token = createSignupIntent(SECRET, VERSIONS, now);
    const intent = verifySignupIntent(SECRET, token, now + 1000);
    assert.deepEqual(intent, { terms: VERSIONS.terms, privacy: VERSIONS.privacy, issuedAt: now });
  });

  it("o token nunca contém o segredo", () => {
    assert.ok(!createSignupIntent(SECRET, VERSIONS, now).includes(SECRET));
  });

  it("recusa assinatura errada, segredo errado, corpo adulterado e lixo", () => {
    const token = createSignupIntent(SECRET, VERSIONS, now);
    assert.equal(verifySignupIntent("outro-segredo", token, now), null);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ t: "9.9.9", p: VERSIONS.privacy, i: now, n: "x" })).toString("base64url");
    assert.equal(verifySignupIntent(SECRET, forged + "." + sig, now), null);
    assert.equal(verifySignupIntent(SECRET, body + "." + sig.slice(0, -2) + "AA", now), null);
    for (const junk of ["", "a.b.c", "abc", null, undefined, "." , "x."]) {
      assert.equal(verifySignupIntent(SECRET, junk, now), null, String(junk));
    }
    assert.equal(verifySignupIntent("", token, now), null);
  });

  it("recusa token expirado e token datado do futuro", () => {
    const token = createSignupIntent(SECRET, VERSIONS, now);
    const ttl = SIGNUP_INTENT_TTL_SECONDS * 1000;
    assert.ok(verifySignupIntent(SECRET, token, now + ttl));
    assert.equal(verifySignupIntent(SECRET, token, now + ttl + 1), null);
    assert.equal(verifySignupIntent(SECRET, token, now - 1), null);
  });

  it("tokens emitidos no mesmo instante são distintos (nonce)", () => {
    assert.notEqual(createSignupIntent(SECRET, VERSIONS, now), createSignupIntent(SECRET, VERSIONS, now));
  });

  it("só serve a usuário NOVO: criado depois da emissão e dentro da janela", () => {
    const intent = { ...VERSIONS, issuedAt: now };
    const ttl = SIGNUP_INTENT_TTL_SECONDS * 1000;
    assert.equal(intentMatchesNewUser(intent, now + 5_000, now + 10_000), true);
    assert.equal(intentMatchesNewUser(intent, now - 1, now + 10_000), false, "usuário antigo (criado antes) não qualifica");
    assert.equal(intentMatchesNewUser(intent, now + ttl + 1, now + ttl + 2), false);
    assert.equal(intentMatchesNewUser(intent, now + 5_000, now + ttl + 1), false, "token vencido");
  });
});

describe("destino depois do aceite (sem open redirect)", () => {
  it("aceita só caminhos internos da área autenticada", () => {
    assert.equal(safeAfterConsentPath("/app"), "/app");
    assert.equal(safeAfterConsentPath("/app/clientes?x=1"), "/app/clientes?x=1");
    assert.equal(safeAfterConsentPath("/onboarding"), "/onboarding");
  });

  it("qualquer outra coisa cai em /app", () => {
    for (const bad of [null, undefined, "", "https://evil.test", "//evil.test", "/\\evil", "/admin", "/login", "javascript:alert(1)", "app", "/app:x"]) {
      assert.equal(safeAfterConsentPath(bad), "/app", String(bad));
    }
  });
});
