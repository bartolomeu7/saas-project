import test from "node:test";
import assert from "node:assert/strict";
import { results } from "../chat-bateria/bateria.mjs";

/** Chat AI — a bateria de 120 cenários (6 rodadas x 20) roda como parte da suíte: qualquer regressão de conversa aparece aqui. */
test("a bateria tem 6 rodadas de 20 cenários", () => {
  const rounds = new Map();
  for (const r of results) rounds.set(r.round, (rounds.get(r.round) ?? 0) + 1);
  assert.equal(rounds.size, 6);
  for (const [round, n] of rounds) assert.equal(n, 20, round);
});

for (const r of results) {
  test(`bateria · ${r.round} · ${r.name}`, () => {
    assert.ok(r.pass, r.notes.join(" ; "));
  });
}
