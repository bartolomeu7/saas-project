import test from "node:test";
import assert from "node:assert/strict";
import { isTransientClerkNetworkError, withClerkRetry } from "../../src/lib/auth/clerk-retry.ts";

const networkError = () => Object.assign(new Error(""), { clerkError: true, errors: [{ code: "unexpected_error", message: "fetch failed" }] });
const noSleep = async () => {};

test("falha de rede do Clerk é reconhecida; resposta com status HTTP não", () => {
  assert.equal(isTransientClerkNetworkError(networkError()), true);
  assert.equal(isTransientClerkNetworkError(new Error("read ECONNRESET")), true);
  assert.equal(isTransientClerkNetworkError(Object.assign(new Error("Unauthorized"), { status: 401 })), false);
  assert.equal(isTransientClerkNetworkError(Object.assign(new Error("fetch failed"), { status: 429 })), false);
  assert.equal(isTransientClerkNetworkError(null), false);
  assert.equal(isTransientClerkNetworkError("fetch failed"), false);
});

test("repete em falha de rede e devolve o resultado da tentativa que funcionou", async () => {
  let calls = 0;
  const value = await withClerkRetry(async () => {
    calls++;
    if (calls < 3) throw networkError();
    return "ok";
  }, { sleep: noSleep });
  assert.equal(value, "ok");
  assert.equal(calls, 3);
});

test("desiste depois do limite de tentativas e sobe o último erro", async () => {
  let calls = 0;
  await assert.rejects(
    withClerkRetry(async () => {
      calls++;
      throw networkError();
    }, { attempts: 2, sleep: noSleep }),
    /./
  );
  assert.equal(calls, 2);
});

test("erro que não é de rede (ex.: 401) sobe na hora, sem repetir", async () => {
  let calls = 0;
  await assert.rejects(
    withClerkRetry(async () => {
      calls++;
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }, { sleep: noSleep }),
    /Unauthorized/
  );
  assert.equal(calls, 1);
});
