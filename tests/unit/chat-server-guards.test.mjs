import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
const exists = (rel) => existsSync(path.join(process.cwd(), rel));

/**
 * Chat AI — guardas da camada de servidor (modo sombra). Garantem, por leitura do código, as regras de segurança do
 * planejamento (docs/chat-ai/01 §9): desligado por padrão, empresa/usuário vindos da sessão, nada gravado nos módulos.
 */
const route = read("src/app/(app)/app/chat/turn/route.ts");
const store = read("src/lib/chat/server/store.ts");
const confirm = read("src/app/(app)/app/chat/confirm/route.ts");
const data = read("src/lib/chat/server/agenda-data.ts");

test("a rota vive em /app (passa pelas barreiras do middleware), não em /api", () => {
  assert.ok(exists("src/app/(app)/app/chat/turn/route.ts"));
  assert.equal(exists("src/app/api/chat"), false, "rota em /api ficaria fora de conta ativa, consentimento, 2FA e assinatura");
});

test("desligada por padrão: interruptor global, configuração da empresa com módulo agenda e cota diária", () => {
  assert.ok(route.includes('process.env.CHAT_AI_ENABLED !== "true"'));
  assert.ok(route.includes("settings?.enabled") && route.includes('includes("agenda")'));
  assert.ok(route.includes("bumpUsage") && route.includes("limite_diario") && route.includes("429"));
});

test("empresa e usuário vêm da sessão autenticada, nunca do corpo da requisição", () => {
  assert.ok(route.includes("getCurrentUser()") && route.includes("getCurrentCompany()"));
  assert.ok(!/companyId\s*[:=]\s*parsed\./.test(route) && !route.includes("body.companyId") && !route.includes("body.userId"));
  const bodySchema = route.slice(route.indexOf("const bodySchema"), route.indexOf("const json"));
  assert.ok(!/company|user/i.test(bodySchema.replace("userText", "")), "o corpo aceito não pode trazer empresa nem usuário");
});

test("a rota de turno NUNCA grava nos módulos; só a rota de confirmação grava, e com o interruptor próprio", () => {
  assert.ok(!/\.rpc\(\s*["'](create_appointment|complete_appointment|reschedule_appointment|set_appointment_status|create_|adjust_|complete_sale)/.test(route + store + data));
  assert.ok(!route.includes("createAppointmentCore"), "o turno nunca cria agendamento");
  assert.ok(route.includes('CHAT_AI_CONFIRM_ENABLED !== "true"') && route.includes("Modo teste"));
  assert.ok(confirm.includes("CHAT_AI_CONFIRM_ENABLED") && confirm.includes("CHAT_AI_ENABLED"));
});

test("o servidor só escreve nas tabelas chat_* e a leitura dos módulos usa a sessão do usuário", () => {
  const writes = [...store.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.(insert|update|delete|upsert)/g)].map((m) => m[1]);
  for (const table of writes) assert.ok(table.startsWith("chat_"), `store grava em ${table}`);
  assert.ok(store.includes("createAdminClient") && !data.includes("createAdminClient"), "leitura dos módulos nunca usa a chave de serviço");
  assert.ok(data.includes("createSessionClient"));
  assert.ok(!/\.(insert|update|delete|upsert)\(/.test(data), "agenda-data é só leitura");
});

test("rascunho e conversa sempre filtrados por empresa e usuário", () => {
  for (const fn of ["loadActiveDraft", "discardDraft"]) {
    const body = store.slice(store.indexOf(`export async function ${fn}`));
    assert.ok(/company_id/.test(body.slice(0, 700)) && /user_id/.test(body.slice(0, 700)), fn);
  }
  assert.ok(store.includes('.eq("company_id", companyId).eq("user_id", userId)'));
});

test("texto do usuário é limpo e limitado antes de qualquer uso", () => {
  assert.ok(route.includes("sanitizeUserText") && route.includes("MAX_MESSAGE_LENGTH"));
});

test("resposta nunca é guardada em cache", () => {
  assert.ok(route.includes('"cache-control": "no-store"') && route.includes('dynamic = "force-dynamic"'));
});

// ------------------------------------------------------------------------------------------------ tela (modo teste)
const page = read("src/app/(app)/app/chat/page.tsx");
const client = read("src/components/app/chat/chat-client.tsx");
const cards = read("src/components/app/chat/chat-cards.tsx");

test("tela: aparece para todas com o interruptor global ligado, a menos que a empresa tenha enabled=false; sem tabela vira 'indisponível'", () => {
  assert.ok(page.includes('process.env.CHAT_AI_ENABLED === "true"'));
  assert.ok(page.includes("getChatSettings(") && page.includes("settings?.enabled") && page.includes('includes("agenda")'));
  assert.ok(page.includes("ainda não está disponível"));
});

test("liberado para todos: sem linha em chat_settings vale o padrão ligado (agenda), linha com enabled=false desliga, erro de leitura desliga", () => {
  assert.ok(store.includes("DEFAULT_CHAT_SETTINGS") && /enabled: true, modules: \["agenda"\]/.test(store));
  const fn = store.slice(store.indexOf("export async function getChatSettings"));
  assert.ok(fn.indexOf("if (error) return null") > 0 && fn.indexOf("if (error) return null") < fn.indexOf("DEFAULT_CHAT_SETTINGS"));
  assert.ok(route.includes("getChatSettings") && confirm.includes("getChatSettings"), "turno e confirmação usam a mesma regra");
});

test("aviso de desenvolvimento aparece na tela e o item do menu existe", () => {
  assert.ok(page.includes("Em desenvolvimento") && page.includes("pode errar") && page.includes("usar as telas manualmente"));
  assert.ok(read("src/components/app/nav-items.ts").includes('href: "/app/chat"'));
});

test("tela: só fala com /app/chat/turn e /app/chat/confirm e não tem ação de gravar nos módulos", () => {
  assert.ok(client.includes('post("/app/chat/turn"') && client.includes('post("/app/chat/confirm"'));
  assert.equal([...(client + cards).matchAll(/fetch\(/g)].length, 1, "um único ponto de rede (post), que renova a sessão e tenta de novo");
  assert.ok(!/(createAppointmentAction|create_appointment|createClient|createSessionClient)/.test(client + cards));
});

test("tela: Confirmar só funciona fora do modo teste, uma vez por cartão, e manda só (rascunho, versão)", () => {
  assert.ok(cards.includes("disabled={shadow || locked || confirming || !item.draft}"));
  assert.ok(client.includes("modo teste") && client.includes('post("/app/chat/confirm", { draftId: draft.id, version: draft.version })'));
  assert.ok(client.includes("Não sei se gravou: confira na Agenda antes de tentar de novo"), "sem conexão no Confirmar nunca promete que não gravou");
});

test("tela: texto da conversa nunca vira HTML e links são só rotas internas montadas por nós", () => {
  assert.ok(!(client + cards).includes("dangerouslySetInnerHTML"));
  assert.ok(cards.includes("FIELD_LINKS") && cards.includes('rel="noopener noreferrer"'));
});

test("tela: acessibilidade básica (rótulo do campo, região aria-live, log da conversa, Enter envia)", () => {
  assert.ok(client.includes('htmlFor="chat-input"') && client.includes('aria-live="polite"') && client.includes('role="log"'));
  assert.ok(client.includes("event.shiftKey") && client.includes("isComposing"));
  assert.ok(cards.includes("aria-label") && cards.includes("sr-only"));
});

test("tela: erros conhecidos viram mensagem em português (sessão, desligado, limite)", () => {
  for (const status of ["403", "404", "429"]) assert.ok(client.includes(`${status}:`), status);
  assert.ok(client.includes("isSessionProblem") && client.includes("SESSION_EXPIRED"), "401/redirecionamento para o login = sessão expirada");
  assert.ok(client.includes("getToken"), "renova o token do Clerk antes de falar com o servidor");
  assert.ok(client.includes("Nada foi alterado"));
});

// ------------------------------------------------------------------------------------------------ confirmação (grava)
test("confirmar: o corpo traz só (rascunho, versão); empresa e usuário vêm da sessão", () => {
  const body = confirm.slice(confirm.indexOf("const bodySchema"), confirm.indexOf("const json"));
  assert.ok(body.includes("draftId") && body.includes("version"));
  assert.ok(!/company|user|slots|date|time|cliente|servico/i.test(body.replace("draftId", "")), "nada de dados de gravação vindo do navegador");
  assert.ok(confirm.includes("getCurrentUser()") && confirm.includes("getCurrentCompany()"));
});

test("confirmar: decide pelo planConfirm, reivindica de forma atômica e revalida tudo antes de gravar", () => {
  const order = ["planConfirm(", "claimDraft(", "runAgendarTurn(", "createAppointmentCore("].map((t) => confirm.indexOf(t));
  assert.ok(order.every((i) => i > 0) && [...order].sort((a, b) => a - b).join() === order.join(), "ordem: plano → reivindicar → revalidar → gravar");
  assert.ok(confirm.includes('"aguardando_confirmacao"') && confirm.includes('"mudou"'));
});

test("confirmar: grava com a sessão do usuário (núcleo da tela), nunca com a chave de serviço", () => {
  assert.ok(confirm.includes("createSessionClient()") && !confirm.includes("createAdminClient"));
  assert.ok(confirm.includes("createAppointmentCore(supabase"));
  assert.ok(read("src/lib/agenda/actions.ts").includes("createAppointmentCore"), "tela e chat usam o mesmo núcleo");
  const firstCode = read("src/lib/agenda/create-core.ts").split("\n").find((l) => l.trim() !== "" && !l.trim().startsWith("//") && !l.trim().startsWith("/*") && !l.trim().startsWith("*"));
  assert.ok(!/use server/.test(firstCode ?? ""), "o núcleo não pode virar ação chamável pelo navegador");
  assert.ok(/^import "server-only"/.test(read("src/lib/agenda/create-core.ts")), "o núcleo é só de servidor");
});

test("confirmar: depois de criar, nunca libera o rascunho (novo clique criaria outro)", () => {
  assert.ok(confirm.includes("createdId"));
  const catchBlock = confirm.slice(confirm.lastIndexOf("} catch {"));
  assert.ok(catchBlock.indexOf("if (createdId)") > 0 && catchBlock.indexOf("if (createdId)") < catchBlock.indexOf("releaseDraft"));
  const afterCreate = confirm.slice(confirm.indexOf("createdId = result.id"), confirm.indexOf("revalidatePath"));
  assert.ok(!afterCreate.includes("releaseDraft"), "nada de liberar depois de criar");
});

test("confirmar: a reivindicação é um UPDATE condicional (mesma versão, ainda aguardando, sem chave)", () => {
  const claim = store.slice(store.indexOf("export async function claimDraft"), store.indexOf("export async function completeDraft"));
  for (const part of ['.eq("version", version)', '.eq("status", "aguardando_confirmacao")', '.is("idempotency_key", null)', 'idempotencyKeyFor(draftId, version)']) assert.ok(claim.includes(part), part);
  assert.ok(claim.includes('.eq("company_id", companyId)') && claim.includes('.eq("user_id", userId)'));
});

test("rotas do chat ficam em /app e nenhuma está em /api", () => {
  assert.ok(exists("src/app/(app)/app/chat/confirm/route.ts"));
  assert.equal(exists("src/app/api/chat"), false);
});

test("confirmar: cliente novo só é cadastrado depois do Confirmar, com a sessão do usuário, reaproveitando nome igual e registrando auditoria", () => {
  assert.ok(confirm.includes("s.cliente.isNew") && confirm.includes('from("customers").insert'));
  assert.ok(confirm.indexOf("s.cliente.isNew") > confirm.indexOf("recheck.status"), "só depois da revalidação");
  assert.ok(confirm.includes("norm(c.name) === norm(s.cliente!.name)") && confirm.includes("CUSTOMER_CREATED"));
  assert.ok(!route.includes('from("customers").insert'), "a conversa (turno) nunca cria cliente");
});

test("rotas: só aceitam JSON (um formulário de outro site com text/plain não dispara turno nem confirmação)", () => {
  assert.ok(route.includes('"tipo_invalido"') && route.includes("application/json"));
  assert.ok(confirm.includes('"tipo_invalido"') && confirm.includes("application/json"));
});
