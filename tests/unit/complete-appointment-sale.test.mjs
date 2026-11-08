import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Antes: "Concluir" só trocava o status; a venda, o caixa, o financeiro e os pontos não sabiam do atendimento.
test("a função do banco cria, conclui e (se informado) recebe a venda de forma atômica e idempotente", () => {
  const sql = read("supabase/migrations/20261108150000_complete_appointment_with_sale.sql");
  assert.match(sql, /create or replace function public\.complete_appointment\(/);
  assert.ok(sql.includes("security definer") && sql.includes("set search_path = public"));
  // reutiliza as funções que já têm as regras de venda e pagamento (não duplica a lógica)
  assert.ok(sql.includes("public.complete_sale(v_sale.id)"));
  assert.ok(sql.includes("public.add_sale_payment("));
  // liga o atendimento à venda
  assert.match(sql, /sale_id = v_sale\.id/);
  // idempotência: já concluído com venda devolve o mesmo atendimento
  assert.ok(sql.includes("v_row.sale_id is not null") && sql.includes("return v_row"));
  // só agendado/confirmado conclui; papéis do app; não revela atendimento de outra empresa
  assert.ok(sql.includes("('scheduled', 'confirmed')"));
  assert.ok(sql.includes("('owner', 'admin', 'employee')"));
  assert.ok(sql.includes("v_role is null then raise exception 'Agendamento não encontrado.'"));
  // sem execução anônima
  assert.ok(sql.includes("revoke all on function public.complete_appointment(uuid, public.sale_payment_method, numeric) from public, anon"));
  assert.ok(sql.includes("to authenticated, service_role"));
  assert.ok(existsSync("supabase/rollback/20261108150000_complete_appointment_with_sale.down.sql"));
  assert.ok(existsSync("tests/sql/complete_appointment_with_sale.sql"));
});

test("a ação de servidor valida a forma de pagamento e chama complete_appointment", () => {
  const src = read("src/lib/agenda/actions.ts");
  assert.ok(src.includes("export async function completeAppointmentAction"));
  assert.ok(src.includes('"complete_appointment"'));
  for (const method of ["cash", "pix", "debit", "credit", "other"]) assert.ok(src.includes(`"${method}"`), method);
  assert.ok(src.includes("Forma de pagamento inválida."));
  // valor sem forma de pagamento é recusado antes de ir ao banco
  assert.ok(src.includes("Informe a forma de pagamento."));
  // revalida as telas que mudam: agenda, vendas, caixa, financeiro, dashboard
  for (const route of ["/app/agenda", "/app/vendas", "/app/caixa", "/app/financeiro"]) assert.ok(src.includes(`revalidatePath("${route}")`), route);
});

test("o caminho antigo de status 'concluído' também gera a venda (nunca conclui sem venda)", () => {
  const src = read("src/lib/agenda/actions.ts");
  const start = src.indexOf("export async function setAppointmentStatusAction");
  const body = src.slice(start);
  assert.ok(body.includes('status === "completed"') && body.includes("completeAppointmentAction("));
  assert.ok(body.indexOf('status === "completed"') < body.indexOf('"set_appointment_status"'), "o desvio vem antes da chamada antiga");
});

test("painel e lista do dia concluem pelo formulário que cobra, e mostram o link da venda", () => {
  const forms = read("src/components/app/agenda-action-forms.tsx");
  assert.ok(forms.includes("export function CompleteAppointmentForm"));
  assert.ok(forms.includes("Cobrar depois"), "o padrão é cobrar depois (nunca afirma um recebimento que não aconteceu)");
  assert.ok(forms.includes("useKeepInputOnError"));
  const calendar = read("src/components/app/agenda-week-calendar.tsx");
  assert.ok(calendar.includes("<CompleteAppointmentForm"));
  assert.ok(!calendar.includes('status="completed"'), "sem botão que conclui sem venda");
  assert.ok(calendar.includes("/app/vendas/${appointment.sale_id}"));
  const page = read("src/app/(app)/app/agenda/page.tsx");
  assert.ok(page.includes("<CompleteAppointmentForm"));
  assert.ok(!page.includes('status="completed"'));
  assert.ok(page.includes("/app/vendas/${appointment.sale_id}"));
});

test("os tipos do banco conhecem a função nova", () => {
  const types = read("src/types/supabase.ts");
  assert.ok(types.includes("complete_appointment: {"));
});
