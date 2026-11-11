import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResult, decideOnEnd, displayText, newVoiceSession, stopByUser } from "../../src/lib/chat/voice-session.ts";

test("pausa para pensar: o navegador encerra, mas seguimos ouvindo e o texto se acumula", () => {
  let s = newVoiceSession();
  s = applyResult(s, "agendar lavagem", true);
  const d = decideOnEnd(s, { msSinceStart: 6000 });
  assert.equal(d.action, "restart");
  s = applyResult(d.state, "para o João às 19 horas", true);
  assert.equal(displayText(s), "agendar lavagem para o João às 19 horas");
});

test("parcial substitui parcial e vira confirmado ao encerrar sem final", () => {
  let s = applyResult(newVoiceSession(), "agendar", false);
  s = applyResult(s, "agendar lavagem", false);
  assert.equal(displayText(s), "agendar lavagem");
  const d = decideOnEnd(s, { msSinceStart: 3000 });
  assert.equal(d.action, "restart");
  assert.equal(d.state.committed, "agendar lavagem");
  assert.equal(d.state.interim, "");
});

test("clique em parar: encerra e não perde o parcial", () => {
  let s = applyResult(newVoiceSession(), "oi tudo bem", false);
  s = stopByUser(s);
  assert.equal(displayText(s), "oi tudo bem");
  const d = decideOnEnd(s, { msSinceStart: 2000 });
  assert.equal(d.action, "stop");
  assert.equal(d.reason, "user");
});

test("no-speech não encerra; permissão negada e rede encerram", () => {
  assert.equal(decideOnEnd(newVoiceSession(), { msSinceStart: 5000, errorCode: "no-speech" }).action, "restart");
  assert.equal(decideOnEnd(newVoiceSession(), { msSinceStart: 5000, errorCode: "aborted" }).action, "restart");
  for (const code of ["not-allowed", "audio-capture", "network"]) {
    const d = decideOnEnd(newVoiceSession(), { msSinceStart: 5000, errorCode: code });
    assert.equal(d.action, "stop");
    assert.equal(d.reason, "error");
  }
});

test("reinícios instantâneos em ciclo desistem; um reinício normal zera a contagem", () => {
  let s = newVoiceSession();
  let last;
  for (let i = 0; i < 4; i += 1) {
    last = decideOnEnd(s, { msSinceStart: 50 });
    s = last.state;
  }
  assert.equal(last.action, "stop");
  assert.equal(last.reason, "loop");
  const ok = decideOnEnd({ ...newVoiceSession(), fastEnds: 3 }, { msSinceStart: 4000 });
  assert.equal(ok.action, "restart");
  assert.equal(ok.state.fastEnds, 0);
});
