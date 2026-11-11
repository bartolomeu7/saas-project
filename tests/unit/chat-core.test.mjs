import test from "node:test";
import assert from "node:assert/strict";
import { norm, tokens, nameCoverage, sanitizeUserText, MAX_MESSAGE_LENGTH } from "../../src/lib/chat/text.ts";
import { wordsToNumber, extractMoney, parseAnswerMoney, parseDecimalPt, moneyProblem, MAX_MONEY } from "../../src/lib/chat/numbers-pt.ts";
import { parseDateTimePt, addDays, weekdayOf, formatDatePt, addMinutesToLocal } from "../../src/lib/chat/datetime-pt.ts";
import {
  newDraft, revise, checkConfirm, startExecution, finishExecution, discard, expireIfDue, canTransition, isFinal,
  audioMayBeDeleted, idempotencyKeyFor,
} from "../../src/lib/chat/draft.ts";
import {
  detectAgendar, extractCustomerText, understandAgendar, missingFields, nextQuestion, validateAgendar, suggestFreeStarts,
  summarizeAgendar, effectiveDuration,
} from "../../src/lib/chat/agenda-agendar.ts";

/**
 * Chat AI — núcleo. Relógio fixo: quarta-feira 11/11/2026, 12:00 (São Paulo).
 * Casos tirados do que deu errado nos testes reais de 11/11 e das frases do dono.
 */
const CLOCK = { today: "2026-11-11", nowMinutes: 12 * 60 };

// ------------------------------------------------------------------------------------------------ texto
test("norm tira acento e caixa; tokens ignoram palavras de ligação", () => {
  assert.equal(norm("  Lúcio  SILVA "), "lucio silva");
  assert.deepEqual(tokens("Maria da Silva"), ["maria", "silva"]);
});
test("nameCoverage: fração do nome presente na frase", () => {
  assert.equal(nameCoverage("faz lavagem detalhada hoje", "Lavagem Detalhada"), 1);
  assert.equal(nameCoverage("faz lavagem hoje", "Lavagem Detalhada"), 0.5);
  assert.equal(nameCoverage("nada a ver", "Lavagem Detalhada"), 0);
});
test("sanitizeUserText corta no limite e remove controle", () => {
  assert.equal(sanitizeUserText("a\u0000b").length, 3);
  assert.equal(sanitizeUserText("x".repeat(5000)).length, MAX_MESSAGE_LENGTH);
});

// ------------------------------------------------------------------------------------------------ números e dinheiro
test("números por extenso", () => {
  assert.equal(wordsToNumber(["cento", "e", "cinquenta"]), 150);
  assert.equal(wordsToNumber(["mil", "e", "duzentos"]), 1200);
  assert.equal(wordsToNumber(["dois", "mil", "e", "quinhentos"]), 2500);
  assert.equal(wordsToNumber(["vinte", "e", "cinco"]), 25);
  assert.equal(wordsToNumber(["banana"]), null);
});
test("dinheiro: só com marca de moeda; '50 litros' NÃO é valor", () => {
  const cases = [
    ["R$ 150", 150], ["R$ 1.234,56", 1234.56], ["gastei 1.234,56 reais", 1234.56], ["150 reais", 150],
    ["cento e cinquenta reais", 150], ["gastei mil e duzentos reais", 1200], ["2 mil", 2000], ["1,5 mil reais", 1500],
    ["dois mil e quinhentos reais", 2500], ["80 conto", 80],
  ];
  for (const [text, expected] of cases) assert.equal(extractMoney(text)?.value, expected, text);
  assert.equal(extractMoney("acabou o limpa-baú de 50 litros"), null);
  assert.equal(extractMoney("recebi 150 no pix"), null);
});
test("dinheiro em intenção financeira aceita o único número da frase; com dois números não adivinha", () => {
  assert.equal(extractMoney("paguei 1.234,56 de aluguel", { bareOk: true })?.value, 1234.56);
  assert.equal(extractMoney("recebi 150 no pix", { bareOk: true })?.value, 150);
  assert.equal(extractMoney("paguei 150 em 3 vezes", { bareOk: true }), null);
});
test("resposta curta a 'qual o valor?'", () => {
  assert.equal(parseAnswerMoney("oitenta"), 80);
  assert.equal(parseAnswerMoney("R$ 80,50"), 80.5);
  assert.equal(parseAnswerMoney("120"), 120);
  assert.equal(parseAnswerMoney("não sei"), null);
});
test("formato decimal brasileiro e limites do banco", () => {
  assert.equal(parseDecimalPt("1.234,56"), 1234.56);
  assert.equal(parseDecimalPt("1234.56"), 1234.56);
  assert.equal(parseDecimalPt("1.234"), 1234);
  assert.equal(parseDecimalPt("abc"), null);
  assert.equal(moneyProblem(0), "O valor precisa ser maior que zero.");
  assert.equal(moneyProblem(99_999_999_999), "Esse valor é alto demais para o cadastro.");
  assert.equal(moneyProblem(MAX_MONEY), null);
});

// ------------------------------------------------------------------------------------------------ datas e horas (o que o chrono-node errou)
const dt = (text) => parseDateTimePt(text, CLOCK);
test("data e hora na mesma frase", () => {
  const cases = [
    ["amanhã às 14h", "2026-11-12", "14:00"],
    ["sexta às 14:30", "2026-11-13", "14:30"],
    ["dia 15 às 9h", "2026-11-15", "09:00"],
    ["hoje às 18h", "2026-11-11", "18:00"],
    ["segunda-feira 10h", "2026-11-16", "10:00"],
    ["14h30 do dia 20", "2026-11-20", "14:30"],
    ["15/11 às 8h", "2026-11-15", "08:00"],
    ["20 de dezembro às 9", "2026-12-20", "09:00"],
    ["amanhã de manhã às 9", "2026-11-12", "09:00"],
    ["domingo às 10h", "2026-11-15", "10:00"],
    ["às 2 da tarde amanhã", "2026-11-12", "14:00"],
    ["amanhã às 2 e meia da tarde", "2026-11-12", "14:30"],
    ["depois de amanhã às 16h", "2026-11-13", "16:00"],
  ];
  for (const [text, date, time] of cases) {
    const r = dt(text);
    assert.equal(r.date?.value, date, `${text} (data)`);
    assert.equal(r.time?.value, time, `${text} (hora)`);
    assert.equal(r.time?.candidates, undefined, `${text} (sem ambiguidade)`);
  }
});
test("só data, só hora, meio-dia, daqui a", () => {
  assert.equal(dt("depois de amanhã").date?.value, "2026-11-13");
  assert.equal(dt("depois de amanhã").time, undefined);
  assert.equal(dt("meio-dia").time?.value, "12:00");
  assert.equal(dt("meia-noite").time?.value, "00:00");
  const d = dt("daqui a 2 horas");
  assert.equal(d.time?.value, "14:00");
  assert.equal(d.date?.value, "2026-11-11");
  assert.equal(dt("daqui a 3 dias").date?.value, "2026-11-14");
});
test("faixa do dia sem hora vira pergunta, não chute", () => {
  const r = dt("amanhã de tarde");
  assert.equal(r.date?.value, "2026-11-12");
  assert.equal(r.time, undefined);
  assert.equal(r.dayPart, "tarde");
});
test("hora ambígua devolve as duas leituras", () => {
  const r = dt("às 2");
  assert.deepEqual(r.time?.candidates, ["02:00", "14:00"]);
  assert.equal(dt("às 10").time?.candidates, undefined);
});
test("dia da semana igual a hoje é ambíguo (hoje ou semana que vem)", () => {
  const r = dt("quarta às 10");
  assert.deepEqual(r.date?.candidates, ["2026-11-11", "2026-11-18"]);
});
test("intervalo 'das 14 às 16' dá início e término", () => {
  const r = dt("amanhã das 14 às 16");
  assert.equal(r.time?.value, "14:00");
  assert.equal(r.endTime, "16:00");
});
test("datas e horas impossíveis viram problema e não data", () => {
  assert.match(dt("dia 31 de fevereiro").problems[0], /inválida/);
  assert.equal(dt("dia 31 de fevereiro").date, undefined);
  assert.match(dt("amanhã às 25h").problems[0], /Horário inválido/);
});
test("dia do mês sem mês usa a próxima ocorrência", () => {
  assert.equal(dt("dia 5").date?.value, "2026-12-05");
  assert.equal(dt("dia 31").date?.value, "2026-12-31");
});
test("aritmética de datas e formatação", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekdayOf("2026-11-11"), 3);
  assert.equal(formatDatePt("2026-11-12"), "quinta-feira, 12/11/2026");
  assert.deepEqual(addMinutesToLocal("2026-11-12", "23:00", 150), { date: "2026-11-13", time: "01:30" });
});

// ------------------------------------------------------------------------------------------------ rascunho e estados
const NOW = new Date("2026-11-11T15:00:00Z");
const mkDraft = () => newDraft({ id: "d1", companyId: "c1", userId: "u1", module: "agenda", intent: "agenda.agendar", risk: "R1", slots: {}, now: NOW });

test("rascunho novo: versão 1, coletando, expira em 30 min", () => {
  const d = mkDraft();
  assert.equal(d.version, 1);
  assert.equal(d.status, "coletando");
  assert.equal(new Date(d.expiresAt).getTime() - NOW.getTime(), 30 * 60_000);
});
test("revisar sobe a versão; completo e sem bloqueio vira aguardando confirmação", () => {
  const d1 = revise(mkDraft(), { missing: ["inicio"] }, NOW);
  assert.equal(d1.version, 2);
  assert.equal(d1.status, "coletando");
  const d2 = revise(d1, { missing: [] }, NOW);
  assert.equal(d2.version, 3);
  assert.equal(d2.status, "aguardando_confirmacao");
  const d3 = revise(d2, { blocks: ["Horário ocupado"] }, NOW);
  assert.equal(d3.status, "coletando");
});
test("I1/I7: confirmar só vale para dono, empresa, versão atual, não expirado, completo e sem bloqueio", () => {
  const ready = revise(mkDraft(), { missing: [] }, NOW);
  const ok = { companyId: "c1", userId: "u1", version: ready.version, now: NOW };
  assert.deepEqual(checkConfirm(ready, ok), { ok: true });
  assert.equal(checkConfirm(ready, { ...ok, companyId: "c2" }).reason, "empresa");
  assert.equal(checkConfirm(ready, { ...ok, userId: "u2" }).reason, "usuario");
  assert.equal(checkConfirm(ready, { ...ok, version: ready.version - 1 }).reason, "versao");
  assert.equal(checkConfirm(ready, { ...ok, now: new Date(NOW.getTime() + 31 * 60_000) }).reason, "expirado");
  assert.equal(checkConfirm(mkDraft(), ok).reason, "status");
  const withMissing = { ...ready, missing: ["cliente"] };
  assert.equal(checkConfirm(withMissing, ok).reason, "incompleto");
  const withBlock = { ...ready, blocks: ["x"] };
  assert.equal(checkConfirm(withBlock, ok).reason, "bloqueado");
});
test("I9: rascunho executado, descartado ou expirado nunca volta a executar", () => {
  const ready = revise(mkDraft(), { missing: [] }, NOW);
  const running = startExecution(ready);
  assert.equal(running.status, "executando");
  const done = finishExecution(running, "concluido");
  assert.equal(done.status, "concluido");
  assert.equal(canTransition("concluido", "executando"), false);
  assert.equal(startExecution(done).status, "concluido");
  assert.equal(discard(done).status, "concluido");
  assert.equal(revise(done, { missing: [] }, NOW).version, done.version);
  const expired = expireIfDue(ready, new Date(NOW.getTime() + 60 * 60_000));
  assert.equal(expired.status, "expirado");
  assert.equal(checkConfirm(expired, { companyId: "c1", userId: "u1", version: expired.version, now: NOW }).ok, false);
});
test("executando não expira nem é alterado no meio", () => {
  const running = startExecution(revise(mkDraft(), { missing: [] }, NOW));
  assert.equal(expireIfDue(running, new Date(NOW.getTime() + 999 * 60_000)).status, "executando");
  assert.equal(revise(running, { missing: ["x"] }, NOW).status, "executando");
});
test("I13: áudio só pode ser apagado em estado final (falhou só depois do prazo)", () => {
  for (const s of ["concluido", "descartado", "expirado"]) assert.equal(audioMayBeDeleted(s), true, s);
  for (const s of ["coletando", "aguardando_confirmacao", "executando"]) assert.equal(audioMayBeDeleted(s), false, s);
  assert.equal(audioMayBeDeleted("falhou"), false);
  assert.equal(audioMayBeDeleted("falhou", true), true);
  assert.equal(isFinal("falhou"), false);
});
test("I2: a chave de idempotência é única por rascunho e versão", () => {
  assert.equal(idempotencyKeyFor("d1", 3), "d1:v3");
  assert.notEqual(idempotencyKeyFor("d1", 3), idempotencyKeyFor("d1", 4));
});

// ------------------------------------------------------------------------------------------------ agenda.agendar
const CATALOG = {
  services: [
    { id: "s1", name: "Lavagem Detalhada", durationMinutes: 150, price: 120 },
    { id: "s2", name: "Polimento Técnico Completo", durationMinutes: 210, price: 280 },
    { id: "s3", name: "Teste Duração", durationMinutes: 0, price: 50 },
  ],
  professionals: [
    { id: "p1", name: "Lúcio Silva", active: true, serviceIds: ["s1", "s2", "s3"] },
    { id: "p2", name: "Rafael Teixeira Lima", active: true, serviceIds: ["s2"] },
    { id: "p3", name: "Inativo Costa", active: false, serviceIds: ["s1"] },
  ],
};
const SCHEDULE = {
  availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
  blocks: [{ start: "2026-11-12T12:00", end: "2026-11-12T13:00", reason: "almoço" }],
  busy: [{ start: "2026-11-13T14:00", end: "2026-11-13T16:30", label: "Marcos" }],
};
const ctx = (schedule = SCHEDULE) => ({ clock: CLOCK, catalog: CATALOG, schedule });

test("a ordem do dono: só serviço e cliente → entende serviço e cliente e pergunta início e profissional juntos", () => {
  const text = "Cláudia, faz um agendamento de lavagem detalhada pro cliente João Ferreira";
  assert.equal(detectAgendar(text), true);
  const u = understandAgendar(text, CATALOG, CLOCK);
  assert.deepEqual(u.services.map((s) => s.id), ["s1"]);
  assert.equal(u.customerText, "joao ferreira");
  assert.equal(u.when.date, undefined);
  assert.deepEqual(u.professionals, []);
  const slots = { servico: CATALOG.services[0], cliente: { id: "c1", name: "João Ferreira" } };
  assert.deepEqual(missingFields(slots), ["profissional", "inicio"]);
  const q = nextQuestion(slots, CATALOG);
  assert.deepEqual(q.fields, ["inicio", "profissional"]);
  assert.match(q.text, /2h30/);
  assert.deepEqual(q.options.map((o) => o.label), ["Lúcio Silva"]); // só quem faz o serviço e está ativo
});
test("frase completa extrai tudo", () => {
  const u = understandAgendar("agenda polimento técnico pro Felipe Azevedo amanhã às 14h com o Lúcio", CATALOG, CLOCK);
  assert.deepEqual(u.services.map((s) => s.id), ["s2"]);
  assert.equal(u.customerText, "felipe azevedo");
  assert.equal(u.when.date.value, "2026-11-12");
  assert.equal(u.when.time.value, "14:00");
  assert.deepEqual(u.professionals.map((p) => p.id), ["p1"]);
});
test("cliente e faixa do dia: 'pro Felipe amanhã de tarde' pergunta a hora", () => {
  const u = understandAgendar("marca polimento técnico pro Felipe amanhã de tarde", CATALOG, CLOCK);
  assert.equal(u.customerText, "felipe");
  assert.equal(u.when.dayPart, "tarde");
  const q = nextQuestion({ servico: CATALOG.services[1], cliente: { id: "c", name: "Felipe" }, profissional: { id: "p2", name: "Rafael" }, date: "2026-11-12", dayPart: "tarde" }, CATALOG);
  assert.match(q.text, /Em que horário da tarde/);
});
test("nome completo do serviço escolhe o mais específico; palavra genérica devolve os dois para perguntar", () => {
  const catalog = {
    ...CATALOG,
    services: [...CATALOG.services, { id: "s8", name: "Lavagem Simples", durationMinutes: 60, price: 60 }, { id: "s9", name: "Lavagem Detalhada Premium", durationMinutes: 240, price: 200 }],
  };
  assert.deepEqual(understandAgendar("agenda lavagem detalhada pro João", catalog, CLOCK).services.map((s) => s.id), ["s1"]);
  assert.deepEqual(understandAgendar("agenda lavagem pro João", catalog, CLOCK).services.map((s) => s.id).sort(), ["s1", "s8"]);
});
test("não é agendamento", () => {
  assert.equal(detectAgendar("acabou o limpa-baú de 50 litros"), false);
  assert.equal(detectAgendar("paguei 1.234,56 de aluguel"), false);
});
test("extração do nome do cliente para na data/hora e não corta nomes com 'da'/'de'", () => {
  assert.equal(extractCustomerText("agenda pra Maria da Silva amanhã às 10h"), "maria da silva");
  assert.equal(extractCustomerText("marca para o cliente José de Souza sexta 14h com o Lúcio"), "jose de souza");
  assert.equal(extractCustomerText("agenda lavagem"), undefined);
});

const READY = {
  servico: CATALOG.services[0], cliente: { id: "c1", name: "João Ferreira" }, profissional: { id: "p1", name: "Lúcio Silva" },
  date: "2026-11-12", time: "14:00",
};
test("agendamento válido: sem bloqueios, término calculado pela duração do serviço", () => {
  const v = validateAgendar(READY, ctx());
  assert.deepEqual(v.blocks, []);
  assert.equal(v.end, "2026-11-12T16:30");
  assert.equal(v.durationMinutes, 150);
  const card = summarizeAgendar(READY, v);
  const when = card.fields.find((f) => f.label === "Quando");
  assert.match(when.value, /quinta-feira, 12\/11\/2026 · 14:00 às 16:30 \(2h30\)/);
  assert.equal(card.fields.find((f) => f.label === "Valor").value.replace(/\s/g, " "), "R$ 120,00");
  assert.equal(card.fields.find((f) => f.label === "Cliente").link.kind, "cliente");
});
test("regras do módulo: bloqueio, conflito, fora do expediente, dia sem expediente, profissional sem o serviço", () => {
  assert.match(validateAgendar({ ...READY, time: "11:30" }, ctx()).blocks[0], /bloqueio.*almoço/);
  assert.match(validateAgendar({ ...READY, date: "2026-11-13" }, ctx()).blocks[0], /já está ocupado.*Marcos/);
  assert.match(validateAgendar({ ...READY, time: "17:00" }, ctx()).blocks[0], /não atende nesse horário.*09:00 a 18:00/);
  assert.match(validateAgendar({ ...READY, date: "2026-11-14" }, ctx()).blocks[0], /sábado \(dia sem expediente\)/);
  assert.match(validateAgendar({ ...READY, date: "2026-11-15" }, ctx()).blocks[0], /domingo \(dia sem expediente\)/);
  assert.match(validateAgendar({ ...READY, profissional: { id: "p2", name: "Rafael" } }, ctx()).blocks[0], /Rafael não faz Lavagem Detalhada\. Quem faz: Lúcio Silva/);
  assert.match(validateAgendar({ ...READY, profissional: { id: "p3", name: "Inativo Costa" } }, ctx()).blocks[0], /não está ativo/);
});
test("serviço sem duração bloqueia, a não ser que o usuário diga o término", () => {
  const semDuracao = { ...READY, servico: CATALOG.services[2] };
  assert.match(validateAgendar(semDuracao, ctx()).blocks[0], /sem duração cadastrada/);
  const comFim = { ...semDuracao, time: "10:00", endTime: "11:00" };
  assert.deepEqual(validateAgendar(comFim, ctx()).blocks, []);
  assert.equal(effectiveDuration(comFim), 60);
  assert.match(validateAgendar({ ...comFim, endTime: "09:00" }, ctx()).blocks[0], /término precisa ser depois/);
});
test("sem expediente cadastrado só valem bloqueio e conflito", () => {
  const livre = { availability: [], blocks: [], busy: [] };
  assert.deepEqual(validateAgendar({ ...READY, date: "2026-11-15" }, ctx(livre)).blocks, []);
});
test("avisos: passado, meia-noite, mais de um ano", () => {
  assert.match(validateAgendar({ ...READY, date: "2026-11-11", time: "09:00" }, ctx({ ...SCHEDULE, availability: [] })).warnings[0], /já passou/);
  const noite = { ...READY, servico: { ...CATALOG.services[0], durationMinutes: 150 }, time: "23:00" };
  assert.match(validateAgendar(noite, ctx({ availability: [], blocks: [], busy: [] })).warnings.join(" "), /depois da meia-noite \(01:30/);
  const exato = { ...READY, servico: { ...CATALOG.services[0], durationMinutes: 120 }, time: "22:00" };
  assert.deepEqual(validateAgendar(exato, ctx({ availability: [], blocks: [], busy: [] })).warnings, []);
  assert.match(validateAgendar({ ...READY, date: "2028-01-10" }, ctx({ availability: [], blocks: [], busy: [] })).warnings.join(" "), /mais de um ano/);
});
test("horários livres sugeridos respeitam expediente, bloqueio, conflito e o passado", () => {
  assert.deepEqual(suggestFreeStarts("2026-11-12", 150, SCHEDULE, CLOCK, 20), ["09:00", "09:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"]);
  assert.deepEqual(suggestFreeStarts("2026-11-13", 150, SCHEDULE, CLOCK, 20).includes("14:00"), false);
  const today = suggestFreeStarts("2026-11-11", 60, { availability: [], blocks: [], busy: [] }, CLOCK, 3);
  assert.deepEqual(today, ["12:30", "13:00", "13:30"]);
  assert.deepEqual(suggestFreeStarts("2026-11-14", 60, SCHEDULE, CLOCK), []);
});
test("cartão só existe com a ficha completa", () => {
  assert.equal(summarizeAgendar({ servico: CATALOG.services[0] }, { blocks: [], warnings: [] }), null);
});

// ------------------------------------------------------------------------------------------------ pureza do núcleo
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
test("núcleo do Chat AI é puro: sem banco, rede, React nem Next (só importa arquivos do próprio núcleo)", () => {
  const dir = path.join(process.cwd(), "src/lib/chat");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(path.join(dir, file), "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.ok(match[1].startsWith("./"), `${file} importa "${match[1]}" (o núcleo só pode importar ./ do próprio núcleo)`);
    }
    assert.ok(!/\bfetch\(|process\.env|createSessionClient|"use server"/.test(source), `${file} usa rede, ambiente ou servidor`);
  }
});
