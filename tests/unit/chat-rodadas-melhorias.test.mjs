import test from "node:test";
import assert from "node:assert/strict";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";
import { CLOCK, CATALOG, PORTS } from "../chat-bateria/fixture-teste1.mjs";

/**
 * Chat AI — melhorias achadas nas 10 rodadas de observação (200 conversas, catálogo real da teste1).
 * Relógio: quarta 11/11/2026 12:58. Rafael atende seg–sex 9–18; 12/11 tem almoço 12–13 e atendimento 13:00–15:30.
 */
const run = async (turns, ports = PORTS) => {
  let state = emptyState();
  let r;
  for (const t of turns) {
    r = await runAgendarTurn({ text: t, state: JSON.parse(JSON.stringify(state)), catalog: CATALOG, clock: CLOCK }, ports);
    state = r.state;
  }
  return r;
};
const card = (r) => r.messages.find((m) => m.kind === "confirm")?.card;
const val = (r, label) => card(r)?.fields.find((f) => f.label === label)?.value ?? "";
const text = (r) => r.messages.map((m) => m.text ?? "").join(" | ");
const has = (r, kind, rx) => r.messages.some((m) => m.kind === kind && rx.test(m.text));

// ------------------------------------------------------------------ digitação e voz
test("erros de digitação: verbo, serviço e nome do cliente", async () => {
  let r = await run(["agendr polimento pra Juliana amanha as 10"]);
  assert.equal(r.state.slots.servico?.name, "Polimento Técnico Completo");
  r = await run(["agenda um polimeto pra juliana sexta 14h"]);
  assert.equal(r.state.slots.servico?.name, "Polimento Técnico Completo");
  r = await run(["quero marca uma hidratação pro marcos viniscius quinta 9h"]);
  assert.equal(r.state.slots.cliente?.name, "Marcos Vinícius Albuquerque");
});

test("horários por voz: 'quinze para as onze', 'dez para as quatro da tarde', 'meio dia e meia'", async () => {
  const base = "agendar barba para João Pedro com a Ana amanhã ";
  assert.match(val(await run([base + "às quinze para as onze"]), "Quando"), /· 10:45/);
  assert.match(val(await run([base + "às dez para as quatro da tarde"]), "Quando"), /· 15:50/);
  assert.match(val(await run([base + "ao meio dia e meia"]), "Quando"), /· 12:30/);
});

test("datas: 'seg 14h', 'dia 20-12', 'quarta da semana que vem', 'fim do mês'", async () => {
  const r = async (when) => (await run([`agendar barba para João Pedro com a Ana ${when}`])).state.slots;
  assert.equal((await r("seg 14h")).date, "2026-11-16");
  assert.equal((await r("dia 21-12 às 10h")).date, "2026-12-21");
  assert.equal((await r("na quarta-feira da semana que vem às 10h")).date, "2026-11-18");
  assert.equal((await r("no fim do mês às 10h")).date, "2026-11-30");
});

test("'às 9h até 13h' define o término", async () => {
  assert.match(val(await run(["agendar polimento para João Pedro com Felipe segunda às 9h até 13h"]), "Quando"), /09:00 às 13:00/);
});

// ------------------------------------------------------------------ cliente
test("nome sem 'para': 'corte do joão paulo amanhã 15h' e nome com maiúsculas no meio", async () => {
  assert.equal((await run(["corte do joão paulo amanhã 15h com a Ana"])).state.slots.cliente?.name, "João Paulo Lima");
  assert.equal((await run(["agende polimento Marcos Vinícius Albuquerque 18/11 10:30"])).state.slots.cliente?.name, "Marcos Vinícius Albuquerque");
});

test("cliente por telefone, título e sobrenome extra", async () => {
  assert.equal((await run(["agendar corte para o cliente do final 7777 amanhã às 10h"])).state.slots.cliente?.name, "João Pedro Santos");
  assert.equal((await run(["agendar corte para o Dr. João Pedro amanhã às 10h"])).state.slots.cliente?.name, "João Pedro Santos");
  assert.equal((await run(["agendar corte para Joao Pedro Santos Junior amanhã às 10h"])).state.slots.cliente?.name, "João Pedro Santos");
});

test("vírgula encerra o nome ('pro João Pedro, de preferência amanhã')", async () => {
  const r = await run(["olha, queria ver se dá pra marcar um corte pro João Pedro, de preferência amanhã de manhã, com a Ana"]);
  assert.equal(r.state.slots.cliente?.name, "João Pedro Santos");
});

test("'agendar a Marcos para polimento' (cliente antes do 'para')", async () => {
  const r = await run(["preciso agendar a Marcos Vinícius para polimento na terça às 11"]);
  assert.equal(r.state.slots.cliente?.name, "Marcos Vinícius Albuquerque");
  assert.equal(r.state.slots.servico?.name, "Polimento Técnico Completo");
});

// ------------------------------------------------------------------ valor, duração, observação
test("valor, grátis, desconto e observação ditos junto do pedido", async () => {
  const base = "agendar corte para João Pedro amanhã às 10h com a Ana";
  assert.equal((await run([`${base} valor 80 reais`])).state.slots.priceOverride, 80);
  assert.equal((await run([`${base} por R$ 35`])).state.slots.priceOverride, 35);
  assert.equal((await run([`${base} grátis`])).state.slots.priceOverride, 0);
  assert.equal((await run([`${base} com 10% de desconto`])).state.slots.priceOverride, 49.5); // 55 (preço da Ana) - 10%
  const obs = await run([`${base} observação: alérgico a amônia`]);
  assert.equal(obs.state.slots.notes, "alérgico a amônia");
  assert.ok(card(obs).fields.some((f) => f.label === "Observações"));
});

test("duração pedida ('por 1 hora', 'duração 45 minutos') sem confundir com o serviço 'Teste Duracao'", async () => {
  const base = "agendar corte para João Pedro amanhã às 10h com a Ana";
  assert.match(val(await run([`${base} por 1 hora`]), "Quando"), /10:00 às 11:00/);
  const r = await run([`${base} duração 45 minutos`]);
  assert.match(val(r, "Quando"), /10:00 às 10:45/);
  assert.equal(r.state.slots.servico?.name, "Corte Masculino");
});

test("pedidos que ainda não existem são avisados (recorrência, duplicar, 'com desconto' sem valor)", async () => {
  const base = "agendar corte para João Pedro amanhã às 10h com a Ana";
  assert.ok(has(await run([`${base} toda semana`]), "notice", /não faço agendamentos que se repetem/));
  assert.ok(has(await run([base, "duplica para a Beatriz"]), "notice", /um de cada vez/));
  assert.ok(has(await run([`${base} com desconto`]), "notice", /valor final ou a porcentagem/));
});

// ------------------------------------------------------------------ profissional
test("profissional citado sem gatilho e 'Ana ou Felipe' pergunta qual", async () => {
  assert.equal((await run(["Ana Paula, corte, João Pedro, amanhã, 10h"])).state.slots.profissional?.name, "Ana Paula Souza");
  assert.equal((await run(["se a Ana puder amanhã às 10, agenda corte pro João Pedro"])).state.slots.profissional?.name, "Ana Paula Souza");
  assert.equal((await run(["agendar barba para João Pedro amanhã às 10h com Ana e Felipe"])).state.pending?.field, "profissional");
});

test("'qualquer profissional' escolhe o primeiro livre", async () => {
  const r = await run(["agendar barba para João Pedro amanhã às 10h com qualquer profissional"]);
  assert.equal(r.state.slots.profissional?.name, "Rafael Teixeira Lima");
  assert.ok(has(r, "notice", /primeiro livre às 10:00/));
});

test("pergunta do profissional só lista quem está livre naquele horário", async () => {
  const r = await run(["agendar polimento para Juliana amanhã às 9h"]);
  // Rafael tem atendimento 13:00 e o almoço 12:00 → polimento (3h30) às 9h só cabe com o Felipe
  assert.equal(r.state.slots.profissional?.name, "Felipe Oliveira");
  assert.ok(has(r, "notice", /único livre às 09:00/));
});

test("dia sem expediente para todos: avisa o DIA, não o horário", async () => {
  const r = await run(["agendar barba para João Pedro no dia 5 de dezembro às 10h"]);
  assert.ok(has(r, "error", /Ninguém atende em sábado/));
  assert.equal(r.state.slots.date, undefined);
  assert.equal(r.state.slots.time, "10:00");
});

test("vários serviços numa frase: agenda um por vez e avisa", async () => {
  const r = await run(["agenda corte e barba pro João Pedro amanhã às 10h"]);
  assert.equal(r.state.slots.servico?.name, "Corte Masculino");
  assert.ok(has(r, "notice", /um serviço por vez.*Barba/));
});

// ------------------------------------------------------------------ faixa do dia e conflitos
test("'de manhã' / 'cedo' / 'depois do almoço' já oferecem horários livres da faixa", async () => {
  const manha = await run(["agendar barba João Pedro com a Ana amanhã cedo"]);
  assert.ok(has(manha, "ask", /Horários livres de manhã.*09:00/));
  assert.ok(manha.state.lastOptions.length >= 3);
  const tarde = await run(["agendar barba João Pedro com a Ana amanhã depois do almoço"]);
  assert.ok(has(tarde, "ask", /Horários livres à tarde/));
});

test("depois de um conflito: 'o 2', 'o primeiro livre', 'com a Ana então', 'no mesmo horário'", async () => {
  const base = "agendar corte para João Pedro terça às 10h com Rafael"; // Rafael tem 10:00 ocupado na terça 17/11
  let r = await run([base, "o 2"]);
  assert.match(val(r, "Quando"), /17\/11\/2026 · 09:30|17\/11\/2026 · 09:00|· 10:30/);
  r = await run([base, "o primeiro livre"]);
  assert.match(val(r, "Quando"), /· 09:00/);
  r = await run([base, "com a Ana então"]);
  assert.match(val(r, "Profissional"), /Ana/);
  assert.match(val(r, "Quando"), /17\/11\/2026 · 10:00/);
  r = await run([base, "dia 18 no mesmo horário"]);
  assert.match(val(r, "Quando"), /18\/11\/2026 · 10:00/);
});

// ------------------------------------------------------------------ depois do resumo
test("editar depois do resumo: outro cliente, recomeçar, adiar, antecipar, 'tá certo'", async () => {
  const base = "agendar corte para João Pedro amanhã às 10h com Ana";
  let r = await run([base, "outro cliente"]);
  assert.ok(has(r, "ask", /Para qual cliente/));
  assert.equal(r.state.slots.cliente, undefined);
  r = await run([base, "recomeçar"]);
  assert.ok(has(r, "notice", /Recomecei do zero/));
  assert.match(val(await run([base, "adiar uma hora"]), "Quando"), /· 11:00/);
  assert.match(val(await run([base, "30 minutos mais cedo"]), "Quando"), /· 09:30/);
  assert.match(val(await run([base, "antecipar para 9h"]), "Quando"), /· 09:00/);
  assert.ok(has(await run([base, "tá certo"]), "notice", /toque em Confirmar/));
  assert.match(val(await run([base, "aumenta o valor para 70"]), "Valor"), /70,00/);
});

// ------------------------------------------------------------------ fora do agendar
test("consultas: horários livres, agenda do dia, preço, duração, quem faz, listas", async () => {
  assert.ok(has(await run(["quais horários livres da Ana amanhã?"]), "notice", /Ana Paula Souza: 09:00/));
  assert.ok(has(await run(["tem horário pra polimento sexta?"]), "notice", /Horários livres em sexta-feira, 13\/11\/2026 para Polimento/));
  assert.ok(has(await run(["o que eu tenho amanhã?"]), "notice", /13:00–15:30 Beatriz Cavalcanti Duarte/));
  assert.ok(has(await run(["quanto custa um corte?"]), "notice", /Corte Masculino: R\$ 45,00.*Ana Paula Souza: R\$ 55,00/));
  assert.ok(has(await run(["qual a duração do polimento?"]), "notice", /dura 3h30/));
  assert.ok(has(await run(["quem faz barba?"]), "notice", /Rafael Teixeira Lima, Ana Paula Souza, Felipe Oliveira/));
  assert.ok(has(await run(["listar meus serviços"]), "notice", /Corte Masculino — R\$ 45,00, 30 min/));
});

test("conversa, ajuda e o que ainda não faz: respostas úteis em vez de 'só agendo'", async () => {
  assert.ok(has(await run(["oi"]), "notice", /Sou a Cláudia/));
  assert.ok(has(await run(["obrigado"]), "notice", /De nada/));
  assert.ok(has(await run(["o que você faz?"]), "notice", /Nada é gravado sem o seu Confirmar/));
  assert.ok(has(await run(["cancelar o corte do João Pedro de amanhã"]), "notice", /Abra a Agenda/));
  assert.ok(has(await run(["reagendar o corte do João Pedro para sexta"]), "notice", /Abra a Agenda/));
  assert.ok(has(await run(["cadastrar o cliente Pedro Alves"]), "notice", /menu Clientes/));
  assert.ok(has(await run(["faturamento de hoje"]), "notice", /menu do lado/));
  // cancelar/reagendar nunca abre um agendamento
  assert.equal((await run(["cancelar o corte do João Pedro de amanhã"])).state.started, false);
});

test("'agendar' sozinho repetido não vira 'não encontrei o serviço agendar'", async () => {
  const r = await run(["agendar", "agendar"]);
  assert.ok(!r.messages.some((m) => /Não encontrei o serviço/.test(m.text ?? "")));
});

test("exemplo da ajuda usa um serviço da própria empresa", async () => {
  const r = await run(["bla bla bla"]);
  assert.match(text(r), /agenda escova progressiva com tratamento pro João/);
});

// ------------------------------------------------------------------ rodada real nº 3 (10 testes aleatórios no site, domingo 15/11/2026)
const SUNDAY = { today: "2026-11-15", nowMinutes: 11 * 60 };
const runAt = async (turns, clock) => {
  let state = emptyState();
  let r;
  for (const t of turns) {
    r = await runAgendarTurn({ text: t, state: JSON.parse(JSON.stringify(state)), catalog: CATALOG, clock }, PORTS);
    state = r.state;
  }
  return r;
};

test("'marcar a Beatriz pra hidratação…' acha o cliente antes do 'pra' (verbo marcar)", async () => {
  const r = await run(["bom dia, preciso marcar a Beatriz pra hidratação profunda na terça às 14h30"]);
  assert.ok(r.state.slots.cliente || r.state.pending?.field === "cliente", "reconheceu a Beatriz (ou perguntou qual das duas)");
  assert.equal(r.state.slots.servico?.name.startsWith("Hidrata"), true);
});

test("abreviações de chat ('oq tenho amanha', 'hj') não quebram as consultas", async () => {
  assert.ok(has(await run(["oq tenho amanha"]), "notice", /Agenda de/));
  assert.ok(has(await run(["oq eu tenho hj?"]), "notice", /Sem agendamentos em quarta/));
});

test("desconto vale sobre o preço que está valendo agora (depois de 'valor 250')", async () => {
  let r = await run(["marca polimento pro marcos dia 17 as 14 com o Rafael", "valor 250", "com 10% de desconto"]);
  assert.match(val(r, "Valor"), /225,00/);
});

test("domingo: 'semana que vem sexta' é a sexta da semana que começa amanhã (20/11), não 27/11", async () => {
  const r = await runAt(["agendar teste onda E para Juliana Ferreira semana que vem sexta às 10h com Rafael"], SUNDAY);
  assert.match(val(r, "Quando"), /20\/11\/2026 · 10:00/);
});

test("dia sem expediente (domingo): limpa o dia, guarda o horário e sugere o próximo dia com vaga", async () => {
  let r = await runAt(["agendar teste onda E para Juliana Ferreira hoje às 18h com Rafael"], SUNDAY);
  assert.ok(has(r, "error", /não atende em domingo/));
  assert.equal(r.state.slots.date, undefined);
  assert.equal(r.state.slots.time, "18:00");
  assert.ok(has(r, "ask", /próximo dia com horário é segunda-feira, 16\/11\/2026/));
  r = await runAt(["agendar teste onda E para Juliana Ferreira hoje às 18h com Rafael", "segunda às 15h"], SUNDAY);
  assert.match(val(r, "Quando"), /16\/11\/2026 · 15:00/);
});

test("depois de 'horários livres', 'agenda o primeiro pro Marcos' continua dali (serviço, dia, profissional e horário já definidos)", async () => {
  let state = emptyState();
  let r = await runAgendarTurn({ text: "quais horários livres de polimento na sexta?", state, catalog: CATALOG, clock: CLOCK }, PORTS);
  assert.ok(r.state.consult?.times.length > 0);
  const first = r.state.consult.times[0];
  r = await runAgendarTurn({ text: "agenda o primeiro pro marcos", state: r.state, catalog: CATALOG, clock: CLOCK }, PORTS);
  assert.equal(r.state.slots.time, first);
  assert.match(r.state.slots.cliente?.name ?? val(r, "Cliente"), /Marcos/);
  assert.equal(r.state.slots.servico?.name, "Polimento Técnico Completo");
});

test("depois de 'horários livres', 'agenda o das 10h pra Beatriz Cavalcanti' escolhe o horário pelo relógio", async () => {
  let r = await runAgendarTurn({ text: "quais horários livres de barba na sexta?", state: emptyState(), catalog: CATALOG, clock: CLOCK }, PORTS);
  assert.ok(r.state.consult?.times.includes("10:00"));
  r = await runAgendarTurn({ text: "marca o das 10h pra Beatriz Cavalcanti", state: r.state, catalog: CATALOG, clock: CLOCK }, PORTS);
  assert.equal(r.state.slots.time, "10:00");
});

test("profissional que não faz o serviço: tira a escolha e pergunta quem vai fazer (sem beco sem saída)", async () => {
  const r = await run(["agendar teste onda E para João Pedro amanhã 17h30 com a Ana"]);
  assert.ok(has(r, "error", /não faz/));
  assert.ok(has(r, "ask", /Quem vai fazer/));
  assert.equal(r.state.slots.profissional, undefined);
});

// ------------------------------------------------------------------ rodada real nº 4 (bateria de 10 diferentes no site, 15/11/2026)
test("'preciso de um horário pra escova progressiva pra Juliana terça de tarde': o cliente é Juliana, não 'escova progressiva'", async () => {
  const r = await run(["preciso de um horário pra escova progressiva pra Juliana terça de tarde"]);
  assert.equal(r.state.slots.cliente?.name, "Juliana Ferreira Nogueira");
  assert.equal(r.state.slots.servico?.name, "Escova Progressiva com Tratamento");
  assert.ok(!r.state.pending?.options?.some((o) => o.id.startsWith("novo:")), "não oferece cadastrar 'escova progressiva'");
});

test("só o primeiro nome do cliente, sem 'para' ('reservar polimento marcos quinta 9h com rafael valor mil reais')", async () => {
  const r = await run(["reservar polimento marcos quinta 9h com rafael valor mil reais"]);
  assert.equal(r.state.slots.cliente?.name, "Marcos Vinícius Albuquerque");
  assert.equal(r.state.slots.priceOverride, 1000);
});

test("primeiro nome que NÃO é único não é adivinhado (João: dois clientes) e nome de profissional/serviço não vira cliente", async () => {
  const r = await run(["reservar polimento joao quinta 9h"]);
  assert.equal(r.state.slots.cliente, undefined);
  const s = await run(["agendar teste onda E rafael amanhã às 15h"]);
  assert.equal(s.state.slots.cliente, undefined);
});

test("'sim' que responde à oferta de cliente novo NÃO gera o lembrete do botão Confirmar (ainda não há resumo)", async () => {
  let r = await run(["agendar polimento para Maria Aparecida terça 10h com o Rafael"]);
  assert.equal(r.state.pending?.options[0].id.startsWith("novo:"), true);
  r = await run(["agendar polimento para Maria Aparecida terça 10h com o Rafael", "sim"]);
  assert.ok(!r.messages.some((m) => /toque em Confirmar/.test(m.text ?? "")), "sem lembrete indevido");
});
