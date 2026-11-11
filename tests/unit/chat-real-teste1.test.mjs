import test from "node:test";
import assert from "node:assert/strict";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";
import { tokens } from "../../src/lib/chat/text.ts";

/**
 * Chat AI — achados da bateria REAL (empresa teste1, produção, 11/11/2026): nomes de serviço longos como os dos clientes,
 * ordem "agendar a <cliente> para <serviço>", nome sem "para", palavras comuns a vários serviços, cliente inativo etc.
 */
const CLOCK = { today: "2026-11-11", nowMinutes: 12 * 60 };
const CATALOG = {
  services: [
    { id: "s1", name: "Escova Progressiva com Tratamento", durationMinutes: 150, price: 280 },
    { id: "s2", name: "Hidratação Profunda com Cronograma (Teste Completo)", durationMinutes: 90, price: 120 },
    { id: "s3", name: "Polimento Técnico Completo", durationMinutes: 210, price: 280 },
    { id: "s4", name: "Serviço Teste Dono 20", durationMinutes: 45, price: 60 },
    { id: "s5", name: "Serviço Teste Onda E", durationMinutes: 30, price: 50 },
    { id: "s6", name: "Teste Duracao", durationMinutes: 0, price: 50 },
  ],
  professionals: [{ id: "p1", name: "Rafael Teixeira Lima", active: true, serviceIds: ["s1", "s2", "s3", "s4", "s5", "s6"] }],
};
const CUSTOMERS = ["Beatriz Cavalcanti Duarte", "Juliana Ferreira Nogueira", "Marcos Vinícius Albuquerque", "Ana Beatriz Souza Lima (Teste Completo)"].map((name, i) => ({ id: `c${i}`, name }));
const INACTIVE = [{ id: "ci", name: "Teste Tel Letras" }];
const find = (list) => async (text) => {
  const wanted = tokens(text);
  return wanted.length ? list.filter((c) => wanted.every((w) => tokens(c.name).some((h) => h === w || (w.length >= 3 && h.startsWith(w))))) : [];
};
const SCHEDULE = { availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })), blocks: [], busy: [] };
const ports = { findCustomers: find(CUSTOMERS), findInactiveCustomers: find(INACTIVE), loadSchedule: async () => SCHEDULE };
const turn = (text, state = emptyState()) => runAgendarTurn({ text, state, catalog: CATALOG, clock: CLOCK }, ports);
const card = (r) => r.messages.find((m) => m.kind === "confirm")?.card;
const val = (r, label) => card(r)?.fields.find((f) => f.label === label)?.value ?? "";

for (const [say, srv] of [
  ["Agendar polimento para Beatriz Cavalcanti amanhã às 10h", /Polimento/],
  ["agenda hidratação pra Beatriz Cavalcanti amanhã às 10h", /Hidrata/],
  ["quero agendar hidratação profunda pro Marcos dia 17/11 às 9h", /Hidrata/],
  ["agendar escova pra Juliana sexta 14h", /Escova/],
  ["agendar progressiva para Juliana amanhã às 9h", /Escova/],
  ["agendar tratamento para Juliana amanhã às 9h", /Escova/],
  ["agendar cronograma para Juliana amanhã às 9h", /Hidrata/],
]) {
  test(`serviço de nome longo por uma palavra: "${say}"`, async () => {
    const r = await turn(say);
    assert.match(val(r, "Serviço"), srv, JSON.stringify(r.messages));
  });
}

test("ordem invertida: 'agendar a Marcos Vinícius para polimento' acha o cliente antes do 'para'", async () => {
  const r = await turn("preciso agendar a Marcos Vinícius para polimento na terça às 11");
  assert.equal(val(r, "Cliente"), "Marcos Vinícius Albuquerque");
  assert.match(val(r, "Serviço"), /Polimento/);
});

test("nome sem 'para', reconhecido pelas maiúsculas", async () => {
  const r = await turn("agende polimento Marcos Vinícius Albuquerque 18/11 10:30");
  assert.equal(val(r, "Cliente"), "Marcos Vinícius Albuquerque");
});

test("serviço dito sem o verbo de agendar ('polimento Beatriz … amanhã às 10h')", async () => {
  const r = await turn("polimento Beatriz Cavalcanti amanhã às 10h");
  assert.match(val(r, "Serviço"), /Polimento/);
});

test("'horário de polimento' é pedido de agendamento", async () => {
  const r = await turn("quero um horário de polimento para a Juliana na segunda");
  assert.ok(!r.messages.some((m) => /Por enquanto eu consigo agendar/.test(m.text ?? "")));
});

test("palavra comum a vários serviços ('teste') pergunta qual, em vez de escolher um", async () => {
  const r = await turn("agendar teste para Juliana amanhã às 9h");
  assert.equal(r.state.pending?.field, "servico");
  assert.ok(r.state.pending.options.length >= 3);
});

test("cliente inativo: avisa em vez de oferecer um cadastro duplicado", async () => {
  const r = await turn("agendar teste onda E para Teste Tel Letras amanhã às 9h");
  assert.ok(r.messages.some((m) => m.kind === "notice" && /inativo/.test(m.text)));
  assert.equal(r.state.pending, null);
});

test("duas pessoas na frase ('Juliana e Marcos'): não oferece cadastrar um cliente chamado assim", async () => {
  const r = await turn("agendar teste onda E para Juliana e Marcos amanhã às 9h");
  assert.ok(!r.state.pending?.options?.some((o) => o.id.startsWith("novo:")));
  assert.ok(r.messages.some((m) => /Não entendi esse nome/.test(m.text ?? "")));
});

test("serviço longo que termina depois do expediente explica a duração (não só 'não atende')", async () => {
  const r = await turn("agendar polimento técnico completo para Juliana Ferreira segunda às 15h");
  const err = r.messages.find((m) => m.kind === "error")?.text ?? "";
  assert.match(err, /dura 3h30.*terminaria às 18:30/);
});

test("mudança de ideia depois do resumo: 'na verdade é para o Marcos Vinícius' troca o cliente", async () => {
  let r = await turn("agendar teste onda E para Juliana Ferreira sexta às 9h");
  assert.match(val(r, "Cliente"), /Juliana/);
  r = await turn("na verdade é para o Marcos Vinícius", r.state);
  assert.match(val(r, "Cliente"), /Marcos/);
});

test("'sim' digitado diante do resumo: nada é gravado e lembra do botão Confirmar", async () => {
  let r = await turn("agendar teste onda E para Juliana Ferreira sexta às 9h");
  r = await turn("sim", r.state);
  assert.ok(r.messages.some((m) => m.kind === "notice" && /toque em Confirmar/.test(m.text)));
  assert.ok(card(r), "o resumo continua na tela");
});

test("'daqui a 2 horas' arredonda para múltiplo de 5 minutos", async () => {
  const r = await runAgendarTurn({ text: "agendar teste onda E para Juliana Ferreira daqui a duas horas", state: emptyState(), catalog: CATALOG, clock: { today: "2026-11-11", nowMinutes: 12 * 60 + 37 } }, ports);
  assert.match(val(r, "Quando"), /· 14:40/);
});

test("nome de profissional com maiúsculas não vira cliente novo ('com o Rafael Teixeira')", async () => {
  const r = await turn("agendar teste onda E Juliana Ferreira amanhã às 9h com o Rafael Teixeira");
  assert.equal(val(r, "Cliente"), "Juliana Ferreira Nogueira");
  assert.ok(!r.state.pending);
});
