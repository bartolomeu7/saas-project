import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveClientIp, normalizeIp, hashClientIp, antifraudSecret, readIpEnv } from "../../src/lib/security/client-ip.ts";

const h = (obj) => ({ get: (name) => obj[name.toLowerCase()] ?? null });
const vercel = { onVercel: true, trustedProxyHops: 0 };
const bare = { onVercel: false, trustedProxyHops: 0 };

describe("origem confiável do IP (nunca cabeçalho cru do cliente)", () => {
  it("na Vercel: o primeiro valor de x-vercel-forwarded-for / x-forwarded-for / x-real-ip", () => {
    assert.equal(resolveClientIp(h({ "x-vercel-forwarded-for": "203.0.113.5, 10.0.0.1" }), vercel), "203.0.113.5");
    assert.equal(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9" }), vercel), "203.0.113.9");
    assert.equal(resolveClientIp(h({ "x-real-ip": "198.51.100.7" }), vercel), "198.51.100.7");
  });

  it("fora da Vercel e sem proxy confiável configurado: x-forwarded-for FORJADO é ignorado (identificador desconhecido)", () => {
    assert.equal(resolveClientIp(h({ "x-forwarded-for": "1.2.3.4" }), bare), null);
    assert.equal(resolveClientIp(h({ "x-real-ip": "1.2.3.4", "x-vercel-forwarded-for": "1.2.3.4" }), bare), null);
  });

  it("com N proxies confiáveis à frente: conta a partir do FIM, ignorando o que o cliente escreveu à esquerda", () => {
    const forged = "6.6.6.6, 7.7.7.7, 203.0.113.50"; // cliente forjou 2 entradas; o proxy confiável acrescentou o IP real por último
    assert.equal(resolveClientIp(h({ "x-forwarded-for": forged }), { onVercel: false, trustedProxyHops: 1 }), "203.0.113.50");
    assert.equal(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.50, 10.0.0.2" }), { onVercel: false, trustedProxyHops: 2 }), "203.0.113.50");
    assert.equal(resolveClientIp(h({ "x-forwarded-for": "203.0.113.50" }), { onVercel: false, trustedProxyHops: 3 }), null, "cadeia mais curta que o esperado");
  });

  it("valores que não são IP são recusados (injeção, lixo, octetos inválidos)", () => {
    for (const bad of ["not-an-ip", "999.1.1.1", "1.2.3.4; drop table x", "1.2.3", "<script>", "", "   "]) {
      assert.equal(resolveClientIp(h({ "x-vercel-forwarded-for": bad }), vercel), null, bad);
    }
  });

  it("IPv4 com porta e IPv6 entre colchetes/zona são normalizados para IP válido", () => {
    assert.equal(resolveClientIp(h({ "x-vercel-forwarded-for": "203.0.113.5:51234" }), vercel), "203.0.113.5");
    assert.equal(resolveClientIp(h({ "x-vercel-forwarded-for": "[2001:db8::1]" }), vercel), "2001:db8::1");
    assert.equal(resolveClientIp(h({ "x-vercel-forwarded-for": "fe80::1%eth0" }), vercel), "fe80::1");
  });

  it("readIpEnv: VERCEL=1 e TRUSTED_PROXY_HOPS saneado (0..5)", () => {
    assert.deepEqual(readIpEnv({ VERCEL: "1" }), { onVercel: true, trustedProxyHops: 0 });
    assert.deepEqual(readIpEnv({ TRUSTED_PROXY_HOPS: "2" }), { onVercel: false, trustedProxyHops: 2 });
    assert.equal(readIpEnv({ TRUSTED_PROXY_HOPS: "-1" }).trustedProxyHops, 0);
    assert.equal(readIpEnv({ TRUSTED_PROXY_HOPS: "99" }).trustedProxyHops, 0);
    assert.equal(readIpEnv({ TRUSTED_PROXY_HOPS: "abc" }).trustedProxyHops, 0);
  });
});

describe("identificador derivado por HMAC (o IP em claro nunca é gravado)", () => {
  const secret = "segredo-de-teste-com-mais-de-16-caracteres";

  it("64 hex, determinístico e sem conter o IP", () => {
    const a = hashClientIp("203.0.113.5", secret);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(hashClientIp("203.0.113.5", secret), a);
    assert.ok(!a.includes("203") || !a.includes("203.0.113.5"));
  });

  it("IPs diferentes e segredos diferentes geram identificadores diferentes", () => {
    assert.notEqual(hashClientIp("203.0.113.5", secret), hashClientIp("203.0.113.6", secret));
    assert.notEqual(hashClientIp("203.0.113.5", secret), hashClientIp("203.0.113.5", secret + "x"));
  });

  it("IPv6: todo o /64 vira o mesmo identificador (não dá para burlar trocando o final do endereço)", () => {
    assert.equal(normalizeIp("2001:db8:abcd:12:ffff:ffff:ffff:ffff"), "2001:db8:abcd:12::/64");
    assert.equal(normalizeIp("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(hashClientIp("2001:db8:abcd:12::1", secret), hashClientIp("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd", secret));
    assert.notEqual(hashClientIp("2001:db8:abcd:12::1", secret), hashClientIp("2001:db8:abcd:13::1", secret));
  });

  it("segredo: dedicado, ou derivado do segredo do Clerk (nunca o valor cru), ou null (sem fail-open silencioso do app)", () => {
    assert.equal(antifraudSecret({ ANTIFRAUD_HASH_SECRET: "x".repeat(32) }), "x".repeat(32));
    const derived = antifraudSecret({ CLERK_SECRET_KEY: "sk_test_" + "a".repeat(30) });
    assert.match(derived, /^[0-9a-f]{64}$/);
    assert.ok(!derived.includes("sk_test_"));
    assert.equal(antifraudSecret({ ANTIFRAUD_HASH_SECRET: "curto", CLERK_SECRET_KEY: "curto" }), null);
    assert.equal(antifraudSecret({}), null);
  });
});
