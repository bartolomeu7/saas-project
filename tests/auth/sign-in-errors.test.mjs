import test from "node:test";
import assert from "node:assert/strict";
import { mapSignInError } from "../../src/lib/auth/sign-in-errors.ts";

const code = (e) => mapSignInError(e).code;

test("e-mail não confirmado tem mensagem própria", () => {
  const r = mapSignInError({ code: "email_not_confirmed", status: 400 });
  assert.equal(r.code, "email_not_confirmed");
  assert.match(r.error, /não foi confirmado/);
});

test("credenciais inválidas continuam genéricas", () => {
  const r = mapSignInError({ code: "invalid_credentials", status: 400 });
  assert.equal(r.error, "E-mail ou senha inválidos.");
  assert.equal(code({ status: 400 }), "invalid_credentials");
});

test("limite de tentativas e indisponibilidade não viram 'senha inválida'", () => {
  assert.equal(code({ code: "over_request_rate_limit", status: 429 }), "rate_limited");
  assert.equal(code({ status: 429 }), "rate_limited");
  assert.equal(code({ status: 500 }), "unavailable");
  assert.equal(code({}), "unavailable");
  assert.equal(code({ code: "unexpected_failure", status: 502 }), "unavailable");
});
