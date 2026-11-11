import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanTranscript, mergeTranscript, voiceErrorMessage, VOICE_LANG, VOICE_MAX_SECONDS, VOICE_PRIVACY_NOTE, VOICE_UNSUPPORTED_MESSAGE } from "../../src/lib/chat/voice.ts";
import { spokenNumbersToDigits } from "../../src/lib/chat/numbers-pt.ts";
import { parseDateTimePt } from "../../src/lib/chat/datetime-pt.ts";
import { extractCustomerText } from "../../src/lib/chat/agenda-agendar.ts";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
const CLOCK = { today: "2026-11-11", nowMinutes: 12 * 60 };

// ------------------------------------------------------------------------------------------------ transcrição
test("limpeza da transcrição: espaços, pontuação solta e ponto final", () => {
  assert.equal(cleanTranscript("  agenda   polimento  pra  João . "), "agenda polimento pra João");
  assert.equal(cleanTranscript("amanhã às 14h..."), "amanhã às 14h");
  assert.equal(cleanTranscript("oi , tudo bem ?"), "oi, tudo bem?");
  assert.equal(cleanTranscript(""), "");
});

test("junta o que já estava digitado com o que foi falado", () => {
  assert.equal(mergeTranscript("", "agenda lavagem"), "agenda lavagem");
  assert.equal(mergeTranscript("agenda lavagem ", "pro João"), "agenda lavagem pro João");
  assert.equal(mergeTranscript("texto", ""), "texto");
});

test("erros do microfone viram mensagem em português; parar pelo próprio usuário não mostra nada", () => {
  assert.equal(voiceErrorMessage("aborted"), null);
  assert.match(voiceErrorMessage("not-allowed"), /microfone está bloqueado/);
  assert.match(voiceErrorMessage("service-not-allowed"), /microfone está bloqueado/);
  assert.match(voiceErrorMessage("no-speech"), /Não ouvi nada/);
  assert.match(voiceErrorMessage("audio-capture"), /microfone/);
  assert.match(voiceErrorMessage("network"), /sem conexão/);
  assert.match(voiceErrorMessage("qualquer-outro"), /Não consegui ouvir/);
  assert.match(VOICE_UNSUPPORTED_MESSAGE, /Chrome ou o Edge/);
  assert.equal(VOICE_LANG, "pt-BR");
  assert.ok(VOICE_MAX_SECONDS <= 60);
});

test("o aviso de privacidade é honesto: o navegador pode mandar o áudio ao serviço dele", () => {
  assert.match(VOICE_PRIVACY_NOTE, /navegador/);
  assert.match(VOICE_PRIVACY_NOTE, /Google/);
  assert.match(VOICE_PRIVACY_NOTE, /só o texto/);
});

// ------------------------------------------------------------------------------------------------ fala por extenso → data e hora
test("números falados viram dígitos SÓ em contexto de data/hora", () => {
  const cases = [
    ["amanhã às dez horas", "amanha as 10 horas"],
    ["às quatorze e trinta", "as 14 e 30"],
    ["às duas da tarde", "as 2 da tarde"],
    ["dia quinze às nove e quinze", "dia 15 as 9 e 15"],
    ["vinte e cinco de novembro", "25 de novembro"],
    ["às nove e quarenta e cinco", "as 9 e 45"],
    ["dia vinte e três às dezoito horas", "dia 23 as 18 horas"],
    ["daqui a duas horas", "daqui a 2 horas"],
    ["às uma da tarde", "as 1 da tarde"],
  ];
  for (const [input, expected] of cases) assert.equal(spokenNumbersToDigits(input), expected, input);
});

test("números por extenso fora de data/hora não mudam (nomes e artigos)", () => {
  assert.equal(spokenNumbersToDigits("quero uma lavagem"), "quero uma lavagem");
  assert.equal(spokenNumbersToDigits("pro joão dois"), "pro joao dois");
  assert.equal(spokenNumbersToDigits("um cliente novo"), "um cliente novo");
});

test("a fala por extenso é entendida como data e hora", () => {
  const dt = (t) => parseDateTimePt(t, CLOCK);
  assert.equal(dt("amanhã às dez horas").time.value, "10:00");
  assert.equal(dt("às quatorze e trinta").time.value, "14:30");
  assert.equal(dt("às duas da tarde").time.value, "14:00");
  assert.equal(dt("dia quinze às nove e quinze").date.value, "2026-11-15");
  assert.equal(dt("dia quinze às nove e quinze").time.value, "09:15");
  assert.equal(dt("vinte e cinco de novembro às oito").date.value, "2026-11-25");
  assert.equal(dt("das dez às doze").endTime, "12:00");
  assert.equal(dt("às uma da tarde").time.value, "13:00");
});

test("o nome do cliente não engole a hora (inclusive hora com dois dígitos e por extenso)", () => {
  assert.equal(extractCustomerText("agenda polimento pra beatriz às dez horas com o rafael"), "beatriz");
  assert.equal(extractCustomerText("agenda pra Maria da Silva às 10h"), "maria da silva");
  assert.equal(extractCustomerText("marca pro joão dia 15"), "joao");
  assert.equal(extractCustomerText("pra ana às 14:30 com o lúcio"), "ana");
});

// ------------------------------------------------------------------------------------------------ uma fala completa, ponta a ponta
const CATALOG = {
  services: [{ id: "s2", name: "Polimento Técnico Completo", durationMinutes: 210, price: 280 }],
  professionals: [{ id: "p2", name: "Rafael Teixeira Lima", active: true, serviceIds: ["s2"] }],
};
const SCHEDULE = { availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "08:00", end: "19:00" })), blocks: [], busy: [] };
const ports = { findCustomers: async () => [{ id: "c1", name: "Beatriz Cavalcanti Duarte" }], loadSchedule: async () => SCHEDULE };

test("uma fala como o cliente dita chega ao cartão de confirmação", async () => {
  const spoken = "Cláudia agenda um polimento técnico pra Beatriz amanhã às dez horas com o Rafael";
  const r = await runAgendarTurn({ text: spoken, state: emptyState(), catalog: CATALOG, clock: CLOCK }, ports);
  assert.equal(r.status, "aguardando_confirmacao");
  const card = r.messages.at(-1).card;
  assert.match(card.fields.find((f) => f.label === "Quando").value, /quinta-feira, 12\/11\/2026 · 10:00 às 13:30/);
  assert.equal(card.fields.find((f) => f.label === "Cliente").value, "Beatriz Cavalcanti Duarte");
});

test("resposta falada a 'que dia e horário?' funciona por extenso", async () => {
  let r = await runAgendarTurn({ text: "agenda polimento técnico pra Beatriz", state: emptyState(), catalog: CATALOG, clock: CLOCK }, ports);
  assert.equal(r.status, "coletando");
  r = await runAgendarTurn({ text: "sexta às nove e meia", state: r.state, catalog: CATALOG, clock: CLOCK }, ports);
  assert.equal(r.state.slots.time, "09:30");
  assert.equal(r.status, "aguardando_confirmacao");
});

// ------------------------------------------------------------------------------------------------ guardas da interface de voz
const button = read("src/components/app/chat/voice-button.tsx");
const client = read("src/components/app/chat/chat-client.tsx");
const route = read("src/app/(app)/app/chat/turn/route.ts");
const store = read("src/lib/chat/server/store.ts");

test("voz: o ditado só preenche a caixa de texto, nunca envia sozinho nem fala com o servidor", () => {
  assert.ok(!/fetch\(|createClient|createSessionClient|FormData|MediaRecorder|getUserMedia/.test(button), "o botão não grava nem envia áudio");
  assert.ok(client.includes("setInput(mergeTranscript(") && client.includes("onVoiceEnd"));
  const onEnd = client.slice(client.indexOf("const onVoiceEnd"), client.indexOf("const onVoiceMessage"));
  assert.ok(!/send\(/.test(onEnd), "terminar de ouvir não envia a mensagem");
});

test("voz: acessível e com saída por teclado (estado do botão, rótulo, Esc, aviso em região de status)", () => {
  assert.ok(button.includes("aria-pressed") && button.includes("aria-label") && button.includes('"Escape"'));
  assert.ok(client.includes('role="status"') && client.includes("VOICE_PRIVACY_NOTE"));
});

test("voz: navegador sem suporte mostra botão desabilitado com explicação", () => {
  assert.ok(button.includes("VOICE_UNSUPPORTED_MESSAGE") && button.includes("disabled"));
  assert.ok(button.includes("SpeechRecognition") && button.includes("webkitSpeechRecognition"));
});

test("voz: o modo de entrada vai ao servidor e só a transcrição (texto) é guardada, nunca áudio", () => {
  assert.ok(client.includes('inputMode: voiceUsed ? "voz" : "texto"'));
  assert.ok(route.includes('inputMode: z.enum(["texto", "voz"])') && route.includes("inputMode: parsed.inputMode"));
  assert.ok(store.includes('input_mode: args.inputMode ?? "texto"') && store.includes("transcript: args.inputMode"));
  assert.ok(!/audio|áudio/i.test(store.replace(/o áudio nunca chega ao servidor/i, "")), "o servidor não lida com áudio");
});
