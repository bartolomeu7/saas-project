import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  buildOtpauthUri,
  classifyCode,
  decryptSecret,
  deriveKeys,
  encryptSecret,
  generateBackupCodes,
  generateTotp,
  generateTotpSecret,
  hashBackupCode,
  normalizeCode,
  safeEqual,
  totpStep,
  verifyTotp,
} from "../../src/lib/security/two-factor/core.ts";

/**
 * Núcleo da verificação em duas etapas (TOTP). Os vetores de teste vêm da RFC 6238 (Apêndice B, SHA-1): segredo
 * ASCII "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), 6 dígitos.
 */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_VECTORS = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

const master = randomBytes(32).toString("base64");
const keys = deriveKeys(master);

describe("TOTP (RFC 6238)", () => {
  for (const [seconds, expected] of RFC_VECTORS) {
    it(`vetor oficial t=${seconds}s gera ${expected}`, () => {
      assert.equal(generateTotp(RFC_SECRET, seconds * 1000), expected);
    });
  }

  it("aceita o código do passo atual, do anterior e do seguinte, e recusa os mais distantes", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    assert.equal(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now), now), step);
    assert.equal(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now - 30_000), now), step - 1);
    assert.equal(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now + 30_000), now), step + 1);
    assert.equal(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now - 90_000), now), null);
    assert.equal(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now + 90_000), now), null);
  });

  it("devolve o número do passo (o banco usa para impedir o reuso do mesmo código)", () => {
    const now = 1_700_000_000_000;
    const a = verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now), now);
    const b = verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now), now + 5_000);
    assert.equal(a, b, "o mesmo código tem sempre o mesmo passo");
  });

  it("recusa formatos inválidos sem lançar", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 3456", "１２３４５６", "123456\n"]) {
      assert.equal(verifyTotp(RFC_SECRET, bad, 59_000), null, JSON.stringify(bad));
    }
  });

  it("segredo novo é base32 de 160 bits, único a cada vez, e o URI tem emissor e rótulo", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notEqual(a, b);
    const uri = buildOtpauthUri(a, "maria@exemplo.com");
    assert.match(uri, /^otpauth:\/\/totp\//);
    assert.match(uri, /issuer=Prime(%20|\+)Ges/);
    assert.ok(uri.includes(a));
    assert.match(uri, /digits=6/);
    assert.match(uri, /period=30/);
  });
});

describe("cifra do segredo (AES-256-GCM)", () => {
  it("ida e volta", () => {
    const stored = encryptSecret(RFC_SECRET, keys, "user-1");
    assert.match(stored, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(decryptSecret(stored, keys, "user-1"), RFC_SECRET);
  });

  it("o texto guardado não contém o segredo e muda a cada cifra (IV novo)", () => {
    const one = encryptSecret(RFC_SECRET, keys, "user-1");
    const two = encryptSecret(RFC_SECRET, keys, "user-1");
    assert.ok(!one.includes(RFC_SECRET));
    assert.notEqual(one, two);
  });

  it("segredo copiado para a linha de OUTRO usuário não decifra", () => {
    const stored = encryptSecret(RFC_SECRET, keys, "user-1");
    assert.equal(decryptSecret(stored, keys, "user-2"), null);
  });

  it("chave errada, adulteração e lixo devolvem null, nunca lançam", () => {
    const stored = encryptSecret(RFC_SECRET, keys, "user-1");
    const other = deriveKeys(randomBytes(32).toString("base64"));
    assert.equal(decryptSecret(stored, other, "user-1"), null);
    const parts = stored.split(".");
    parts[3] = Buffer.from("adulterado").toString("base64url");
    assert.equal(decryptSecret(parts.join("."), keys, "user-1"), null);
    for (const junk of ["", "x", "v1.a.b", "v2.a.b.c", "v1....", "não é base64"]) assert.equal(decryptSecret(junk, keys, "user-1"), null, junk);
  });
});

describe("chave mestra", () => {
  it("aceita só 32 bytes em base64; ausente ou curta/longa => recurso indisponível (null)", () => {
    assert.ok(deriveKeys(randomBytes(32).toString("base64")));
    assert.equal(deriveKeys(undefined), null);
    assert.equal(deriveKeys(""), null);
    assert.equal(deriveKeys(randomBytes(16).toString("base64")), null);
    assert.equal(deriveKeys(randomBytes(33).toString("base64")), null);
    assert.equal(deriveKeys("isto não é uma chave"), null);
  });

  it("as duas subchaves são diferentes entre si e estáveis para a mesma chave mestra", () => {
    const again = deriveKeys(master);
    assert.notDeepEqual(keys.encKey, keys.hmacKey);
    assert.deepEqual(keys.encKey, again.encKey);
    assert.deepEqual(keys.hmacKey, again.hmacKey);
  });
});

describe("códigos de backup", () => {
  it("gera 10 códigos XXXXX-XXXXX, sem caracteres ambíguos e sem repetição", () => {
    const codes = generateBackupCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(code, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it("o hash ignora caixa, espaços e hífen, e é diferente para códigos diferentes", () => {
    const [a, b] = generateBackupCodes(2);
    assert.equal(hashBackupCode(a, keys), hashBackupCode(a.toLowerCase().replace("-", " "), keys));
    assert.notEqual(hashBackupCode(a, keys), hashBackupCode(b, keys));
    assert.match(hashBackupCode(a, keys), /^[0-9a-f]{64}$/);
  });

  it("o hash depende da chave (outra chave => outro hash)", () => {
    const other = deriveKeys(randomBytes(32).toString("base64"));
    const [a] = generateBackupCodes(1);
    assert.notEqual(hashBackupCode(a, keys), hashBackupCode(a, other));
  });
});

describe("entrada do usuário", () => {
  it("classifica código do app e código de backup, com espaços e hífen", () => {
    assert.deepEqual(classifyCode("123 456"), { kind: "totp", code: "123456" });
    assert.deepEqual(classifyCode(" 000-123 "), { kind: "totp", code: "000123" });
    assert.equal(classifyCode("abcde-23456").kind, "backup");
    assert.equal(classifyCode("ABCDE23456").code, "ABCDE23456");
  });

  it("recusa o que não é nenhum dos dois (inclusive caracteres ambíguos do alfabeto)", () => {
    for (const bad of ["", "12345", "1234567", "ABCDE-1234", "ABCDE-0OIL1", "ÁBCDE-12345", "abc def ghi jkl"]) {
      assert.equal(classifyCode(bad).kind, "invalid", JSON.stringify(bad));
    }
  });

  it("normalizeCode e safeEqual", () => {
    assert.equal(normalizeCode(" ab-c d "), "ABCD");
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
  });
});
