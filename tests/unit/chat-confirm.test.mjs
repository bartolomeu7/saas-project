import test from "node:test";
import assert from "node:assert/strict";
import { newDraft, revise, planConfirm, startExecution, finishExecution, REFUSAL_MESSAGES } from "../../src/lib/chat/draft.ts";
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";

/**
 * Chat AI — confirmação (docs/chat-ai/04: I1, I2, I9). Decisão pura do que fazer com cada clique em Confirmar e
 * revalidação com dados novos. A reivindicação atômica no banco é conferida por leitura de código (chat-server-guards).
 */
const NOW = new Date("2026-11-11T15:00:00Z");
const base = () => revise(newDraft({ id: "d1", companyId: "c1", userId: "u1", module: "agenda", intent: "agenda.agendar", risk: "R1", slots: {}, now: NOW }), { missing: [] }, NOW);
const input = (draft, extra = {}) => ({ companyId: "c1", userId: "u1", version: draft.version, now: NOW, ...extra });

test("clique válido: executa", () => {
  const d = base();
  assert.deepEqual(planConfirm(d, input(d)), { action: "execute" });
});

test("I1: outra empresa, outro usuário, versão antiga, expirado, incompleto ou com bloqueio → recusa com motivo", () => {
  const d = base();
  assert.deepEqual(planConfirm(d, input(d, { companyId: "c2" })), { action: "refuse", reason: "empresa" });
  assert.deepEqual(planConfirm(d, input(d, { userId: "u2" })), { action: "refuse", reason: "usuario" });
  assert.deepEqual(planConfirm(d, input(d, { version: d.version - 1 })), { action: "refuse", reason: "versao" });
  assert.deepEqual(planConfirm(d, input(d, { now: new Date(NOW.getTime() + 31 * 60_000) })), { action: "refuse", reason: "expirado" });
  assert.deepEqual(planConfirm({ ...d, missing: ["cliente"] }, input(d)), { action: "refuse", reason: "incompleto" });
  assert.deepEqual(planConfirm({ ...d, blocks: ["ocupado"] }, input(d)), { action: "refuse", reason: "bloqueado" });
  for (const reason of ["empresa", "usuario", "versao", "expirado", "incompleto", "bloqueado", "status"]) assert.ok(REFUSAL_MESSAGES[reason], reason);
});

test("I2: segundo clique no mesmo cartão — enquanto grava: em andamento; depois de gravar: devolve o resultado (replay)", () => {
  const d = base();
  const running = startExecution(d);
  assert.deepEqual(planConfirm(running, input(running)), { action: "in_progress" });
  const done = finishExecution(running, "concluido");
  assert.deepEqual(planConfirm(done, input(done)), { action: "replay" });
});

test("I9: cartão de versão antiga nunca replica nem executa um rascunho já concluído ou em gravação", () => {
  const d = base();
  const running = startExecution(d);
  assert.deepEqual(planConfirm(running, input(running, { version: running.version - 1 })), { action: "refuse", reason: "versao" });
  const done = finishExecution(running, "concluido");
  assert.deepEqual(planConfirm(done, input(done, { version: done.version - 1 })), { action: "refuse", reason: "status" });
});

test("descartado, expirado e falhou-sem-volta nunca executam", () => {
  const d = base();
  for (const status of ["descartado", "expirado", "coletando"]) {
    const plan = planConfirm({ ...d, status }, input(d));
    assert.equal(plan.action, "refuse", status);
    assert.equal(plan.reason, "status", status);
  }
});

// ------------------------------------------------------------------------------------------------ revalidar na confirmação
const CLOCK = { today: "2026-11-11", nowMinutes: 12 * 60 };
const CATALOG = {
  services: [{ id: "s1", name: "Lavagem Detalhada", durationMinutes: 150, price: 120 }],
  professionals: [{ id: "p1", name: "Lúcio Silva", active: true, serviceIds: ["s1"] }],
};
const FREE = { availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })), blocks: [], busy: [] };
const TAKEN = { ...FREE, busy: [{ start: "2026-11-12T14:00", end: "2026-11-12T16:30", label: "Outra pessoa" }] };
const portsWith = (schedule) => ({ findCustomers: async () => [{ id: "c1", name: "João Ferreira" }], loadSchedule: async () => schedule });
const turn = (state, text, p) => runAgendarTurn({ text, state, catalog: CATALOG, clock: CLOCK }, p);

test("I7: o horário livre no resumo é ocupado por outra pessoa antes do Confirmar → revalida, NÃO confirma e oferece livres", async () => {
  let r = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira amanhã às 14h com o Lúcio", portsWith(FREE));
  assert.equal(r.status, "aguardando_confirmacao");
  const saved = r.state; // estado guardado no rascunho

  // revalidação na confirmação: mesmo estado, texto vazio, agenda de AGORA
  r = await turn(saved, "", portsWith(TAKEN));
  assert.equal(r.status, "coletando");
  assert.ok(r.messages.some((m) => m.kind === "error" && /já está ocupado/.test(m.text)));
  assert.ok(r.messages.some((m) => m.kind === "ask"));
  assert.equal(r.state.slots.time, undefined, "o horário que não serve é descartado");
});

test("revalidação sem mudanças devolve o mesmo cartão (pode gravar)", async () => {
  const first = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira amanhã às 9h com o Lúcio", portsWith(FREE));
  const again = await turn(first.state, "", portsWith(FREE));
  assert.equal(again.status, "aguardando_confirmacao");
  assert.deepEqual(again.messages.at(-1).card.fields, first.messages.at(-1).card.fields);
});

test("revalidação com o profissional inativado desde o resumo não confirma", async () => {
  const first = await turn(emptyState(), "agenda lavagem detalhada pro João Ferreira amanhã às 9h com o Lúcio", portsWith(FREE));
  const catalog = { ...CATALOG, professionals: [{ ...CATALOG.professionals[0], active: false }] };
  const again = await runAgendarTurn({ text: "", state: first.state, catalog, clock: CLOCK }, portsWith(FREE));
  assert.equal(again.status, "coletando");
  assert.ok(again.blocks.some((b) => /não está ativo/.test(b)));
});
