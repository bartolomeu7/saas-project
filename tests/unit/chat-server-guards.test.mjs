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

test("modo sombra: nenhuma gravação nos módulos (sem RPC de negócio, sem rota de confirmação)", () => {
  assert.ok(!/\.rpc\(\s*["'](create_appointment|complete_appointment|reschedule_appointment|set_appointment_status|create_|adjust_|complete_sale)/.test(route + store + data));
  assert.equal(exists("src/app/(app)/app/chat/confirm/route.ts"), false);
  assert.ok(route.includes("shadow: true"));
  assert.ok(route.includes("Modo teste"));
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
