import test from "node:test";
import assert from "node:assert/strict";
import { runAgendarTurn, emptyState, pickOption } from "../../src/lib/chat/agenda-turn.ts";

/**
 * Chat AI — conversa completa de "agendar" com portas falsas (sem banco).
 * Relógio fixo: quarta-feira 11/11/2026, 12:00 (São Paulo).
 */
const CLOCK = { today: "2026-11-11", nowMinutes: 12 * 60 };
const CATALOG = {
  services: [
    { id: "s1", name: "Lavagem Detalhada", durationMinutes: 150, price: 120 },
    { id: "s2", name: "Polimento Técnico Completo", durationMinutes: 210, price: 280 },
  ],
  professionals: [
    { id: "p1", name: "Lúcio Silva", active: true, serviceIds: ["s1", "s2"], overrides: { s1: { durationMinutes: 120, price: 100 } } },
    { id: "p2", name: "Rafael Teixeira Lima", active: true, serviceIds: ["s2"] },
  ],
};
const SCHEDULE = {
  availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
  blocks: [],
  busy: [{ start: "2026-11-12T14:00", end: "2026-11-12T16:00", label: "Marcos" }],
};
const ports = (customers) => ({
  findCustomers: async (text) => customers(text),
  loadSchedule: async () => SCHEDULE,
});
const JOAO = [{ id: "c1", name: "João Ferreira", detail: "(11) 3456-7812" }];
const JOAOS = [...JOAO, { id: "c2", name: "João Ferreira Neto", detail: "(11) 98888-0000" }];

const turn = (state, text, p, extra = {}) => runAgendarTurn({ text, state, catalog: CATALOG, clock: CLOCK, ...extra }, p);
const kinds = (r) => r.messages.map((m) => m.kind);

test("a ordem do dono: serviço + cliente → pergunta início e profissional; resposta → cartão de confirmação", async () => {
  const p = ports(() => JOAO);
  let r = await turn(emptyState(), "Cláudia, faz um agendamento de lavagem detalhada pro cliente João Ferreira", p);
  assert.equal(r.status, "coletando");
  // só o Lúcio faz "Lavagem Detalhada": a Cláudia avisa em vez de perguntar o óbvio
  assert.deepEqual(r.missing, ["inicio"]);
  assert.deepEqual(kinds(r), ["notice", "ask"]);
  assert.match(r.messages[0].text, /Lúcio Silva é o único profissional/);
  assert.deepEqual(r.messages[1].fields, ["inicio"]);
  assert.equal(r.state.slots.cliente.name, "João Ferreira");

  r = await turn(r.state, "amanhã às 14h com o Lúcio", p);
  // 14h amanhã está ocupado (Marcos 14–16): não confirma, oferece horários livres
  assert.equal(r.status, "coletando");
  assert.deepEqual(kinds(r), ["error", "ask"]);
  assert.match(r.messages[0].text, /já está ocupado.*Marcos/);
  assert.match(r.messages[1].text, /Horários livres em quinta-feira, 12\/11\/2026/);
  assert.equal(r.state.slots.time, undefined);

  r = await turn(r.state, "às 16h", p);
  assert.equal(r.status, "aguardando_confirmacao");
  const card = r.messages.at(-1).card;
  assert.equal(card.risk, "R1");
  // duração e valor do Lúcio para este serviço (sobrescritas): 2h00 e R$ 100
  assert.match(card.fields.find((f) => f.label === "Quando").value, /16:00 às 18:00 \(2h\)/);
  assert.match(card.fields.find((f) => f.label === "Valor").value.replace(/\s/g, " "), /R\$ 100,00/);
  assert.match(card.fields.find((f) => f.label === "Valor").note, /profissional/);
});

test("frase completa vai direto para o cartão", async () => {
  const r = await turn(emptyState(), "agenda polimento técnico pro João Ferreira sexta às 10h com o Rafael", ports(() => JOAO));
  assert.equal(r.status, "aguardando_confirmacao");
  assert.deepEqual(kinds(r), ["confirm"]);
  assert.equal(r.messages[0].card.fields.find((f) => f.label === "Profissional").value, "Rafael Teixeira Lima");
});

test("dois clientes parecidos: pergunta qual; resposta '2' escolhe", async () => {
  const p = ports(() => JOAOS);
  let r = await turn(emptyState(), "agenda lavagem detalhada pro João amanhã às 9h com o Lúcio", p);
  assert.equal(r.messages.at(-1).kind, "disambiguate");
  assert.equal(r.state.slots.cliente, undefined);
  r = await turn(r.state, "2", p);
  assert.equal(r.state.slots.cliente.id, "c2");
  assert.equal(r.status, "aguardando_confirmacao");
});

test("clique numa opção (id) tem prioridade", async () => {
  const p = ports(() => JOAOS);
  let r = await turn(emptyState(), "agenda lavagem detalhada pro João amanhã às 9h com o Lúcio", p);
  r = await turn(r.state, "", p, { choice: { field: "cliente", id: "c1" } });
  assert.equal(r.state.slots.cliente.id, "c1");
});

test("resposta que não escolhe nada repete as opções", async () => {
  const p = ports(() => JOAOS);
  let r = await turn(emptyState(), "agenda lavagem detalhada pro João amanhã às 9h com o Lúcio", p);
  r = await turn(r.state, "tanto faz", p);
  assert.equal(r.messages[0].kind, "disambiguate");
  assert.equal(r.state.pending.field, "cliente");
});

test("cliente não encontrado: oferece cadastrar como novo (sem criar nada) e mantém o nome como foi dito", async () => {
  const r = await turn(emptyState(), "agenda lavagem detalhada pro Zé Inexistente", ports(() => []));
  assert.equal(r.state.slots.cliente, undefined);
  assert.equal(r.state.pending.field, "cliente");
  assert.equal(r.state.pending.options[0].id, "novo:Zé Inexistente");
  assert.ok(r.messages.some((m) => m.kind === "disambiguate" && /cadastrar como cliente novo/.test(m.text)));
});

test("cliente novo: 'sim' aceita, vira cliente marcado como novo e o cartão avisa que será cadastrado na confirmação", async () => {
  const p = ports(() => []);
  let r = await turn(emptyState(), "agendar cliente João Ferreira às 14:00 sexta lavagem detalhada com o Lúcio", p);
  assert.equal(r.state.pending.field, "cliente");
  assert.equal(r.state.pending.options[0].id, "novo:João Ferreira");
  r = await turn(r.state, "sim", p);
  assert.deepEqual(r.state.slots.cliente, { id: "", name: "João Ferreira", isNew: true });
  assert.equal(r.status, "aguardando_confirmacao");
  const card = r.messages.find((m) => m.kind === "confirm").card;
  assert.ok(card.fields.find((f) => f.label === "Cliente").note.includes("será cadastrado"));
});

test("cliente novo: responder com outro nome volta a procurar; 'escrever outro nome' pergunta o cliente", async () => {
  const p = ports((t) => (/joao/.test(t) ? JOAO : []));
  let r = await turn(emptyState(), "agenda lavagem detalhada pro Zé Inexistente sexta às 14:00 com o Lúcio", p);
  r = await turn(r.state, "João Ferreira", p);
  assert.equal(r.state.slots.cliente.id, "c1");
  let q = await turn(emptyState(), "agenda lavagem detalhada pro Zé Inexistente", ports(() => []));
  q = await turn(q.state, "2", ports(() => []));
  assert.ok(q.messages.some((m) => m.kind === "ask" && /cliente/i.test(m.text)));
});

test("serviço que não existe: avisa em vez de repetir a mesma pergunta; sem nenhum serviço ativo, orienta cadastrar", async () => {
  const p = ports(() => JOAO);
  let r = await turn(emptyState(), "agendar pro João Ferreira sexta às 14:00 tipo de serviço enceramento ceramico", p);
  assert.ok(r.messages.some((m) => m.kind === "notice" && /Não encontrei esse serviço/.test(m.text)));
  r = await turn(r.state, "enceramento ceramico", p);
  assert.ok(r.messages.some((m) => m.kind === "notice" && /Não encontrei esse serviço/.test(m.text)));
  const empty = await turn(emptyState(), "agendar pro João Ferreira sexta às 14:00 lavagem", p, { catalog: { ...CATALOG, services: [] } });
  assert.ok(empty.messages.some((m) => m.kind === "ask" && /nenhum serviço ativo cadastrado/.test(m.text)));
});

test("hora ambígua pergunta; dia da semana igual a hoje pergunta; serviço genérico pergunta", async () => {
  const p = ports(() => JOAO);
  let r = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira sexta às 2 com o Lúcio", p);
  assert.equal(r.state.pending.field, "hora");
  assert.deepEqual(r.state.pending.options.map((o) => o.label), ["02:00", "14:00"]);
  r = await turn(r.state, "2", p); // segunda opção = 14:00
  assert.equal(r.state.slots.time, "14:00");
  assert.equal(r.status, "aguardando_confirmacao");
  const r2 = await turn(emptyState(), "marca lavagem detalhada pro João Ferreira quarta às 10 com o Lúcio", p);
  assert.equal(r2.state.pending.field, "data");
});

test("sem profissional na frase e só um habilitado: sugere e segue", async () => {
  const r = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira amanhã às 9h", ports(() => JOAO));
  assert.equal(r.state.slots.profissional.id, "p1");
  assert.equal(r.status, "aguardando_confirmacao");
});

test("fora do assunto: não cria rascunho e explica o que sabe fazer", async () => {
  const r = await turn(emptyState(), "acabou o limpa-baú de 50 litros", ports(() => JOAO));
  assert.equal(r.state.started, false);
  assert.equal(r.messages[0].kind, "notice");
});

test("cancelar no meio descarta o rascunho", async () => {
  const p = ports(() => JOAO);
  let r = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira", p);
  assert.equal(r.state.started, true);
  r = await turn(r.state, "deixa pra lá", p);
  assert.equal(r.state.started, false);
  assert.deepEqual(r.state.slots, {});
});

test("dia sem expediente: explica e pede outro dia", async () => {
  const r = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira sábado às 10h com o Lúcio", ports(() => JOAO));
  assert.equal(r.status, "coletando");
  assert.match(r.messages[0].text, /sábado \(dia sem expediente\)/);
});

test("pickOption: número, nome e ambiguidade", () => {
  const opts = [{ id: "a", label: "Lúcio Silva" }, { id: "b", label: "Lúcia Costa" }];
  assert.equal(pickOption("1", opts).id, "a");
  assert.equal(pickOption("lucio", opts).id, "a");
  assert.equal(pickOption("costa", opts).id, "b");
  assert.equal(pickOption("luc", opts), null);
  assert.equal(pickOption("3", opts), null);
});
