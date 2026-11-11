import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

/**
 * Auditoria de 10/11/2026: as CONSULTAS DE LEITURA do RH não tinham teste nenhum, e foi exatamente aí que o bug
 * passou — a tela perguntava "este mês já tem pagamento?" sem filtrar o tipo, então uma parcela do 13º (que vai de
 * 01/01 a 31/12) fazia a tela travar a folha dos 12 meses do ano, enquanto o banco liberava.
 * Estes testes prendem o filtro no lugar: a regra da tela tem de ser a mesma do banco.
 */

const queries = read("src/lib/hr/queries.ts");

/** Recorta o corpo de uma função exportada (até a próxima declaração no nível do arquivo). */
function body(name) {
  const start = queries.indexOf(`export async function ${name}(`);
  assert.ok(start > 0, `${name} não encontrada`);
  const rest = queries.slice(start + 10);
  const next = rest.search(/\nexport (async function|function|interface|const)/);
  return next === -1 ? rest : rest.slice(0, next);
}

test("só folha e período ocupam o mês: férias e 13º não bloqueiam o fechamento", () => {
  const fn = body("hasPaymentInMonth");
  assert.ok(fn.includes('.in("kind", PAYROLL_KINDS)'), "hasPaymentInMonth precisa filtrar o tipo de pagamento");
  assert.ok(fn.includes('.neq("status", "canceled")'), "pagamento cancelado não ocupa o mês");
  assert.match(queries, /const PAYROLL_KINDS = \["period", "payroll"\] as const;/);
});

test("a sugestão de período do modo informal também ignora férias e 13º", () => {
  assert.ok(body("getLastClosedPeriodEnd").includes('.in("kind", PAYROLL_KINDS)'));
});

test("a regra da tela é a mesma do banco (kind period/payroll)", () => {
  const sql = read("supabase/migrations/20261108180000_hr_vacation_13th.sql");
  const noBreak = sql.replace(/\r/g, "");
  assert.equal((noBreak.match(/p\.kind in \('period', 'payroll'\)/g) ?? []).length, 3, "banco filtra nos 3 pontos");
  // a tela usa a mesma dupla de tipos
  assert.ok(queries.includes('["period", "payroll"]'));
});

test("o aviso de férias respeita o direito reduzido por faltas (não compara com 30 fixo)", () => {
  const fn = body("getHrAlerts");
  assert.ok(fn.includes("entitled_days"), "precisa ler o direito gravado nas férias");
  assert.ok(fn.includes("scheduledDays >= entitled"), "compara com o direito, não com 30");
  assert.ok(!/scheduledDays >= 30/.test(fn), "não pode comparar com 30 fixo");
});

test("as tabelas de imposto avisam quando estão defasadas", () => {
  const fn = body("getPayrollTables");
  assert.ok(fn.includes("outdated"), "getPayrollTables devolve se a tabela está velha");
  assert.ok(fn.includes("newest.slice(0, 4) < monthStart.slice(0, 4)"), "compara o ano da tabela com o ano da folha");
  // a tela mostra o aviso
  const page = read("src/app/(app)/app/rh/[id]/page.tsx");
  assert.ok(page.includes("built.outdated") && page.includes("podem estar defasados"));
  assert.ok(page.includes("loaded?.outdated"), "aba de férias e 13º também avisa");
});

test("erro técnico do banco não chega à tela em jargão", () => {
  const actions = read("src/lib/hr/actions.ts");
  assert.ok(actions.includes("function friendly("), "existe tradutor de erro");
  assert.ok(actions.includes('error.code === "P0001"'), "mensagem de regra de negócio é preservada");
  assert.ok(!/error\??\.message \|\|/.test(actions), "nenhuma ação devolve a mensagem crua do banco");
  assert.ok(actions.includes("console.error"), "o erro técnico vai para o log do servidor");
});

test("a folha manda faltas e dias de férias separados para o banco", () => {
  const actions = read("src/lib/hr/actions.ts");
  assert.ok(actions.includes("p_vacation_days: vacationDays"));
  assert.ok(!actions.includes("p_absence_days: absences + vacationDays"), "não pode somar férias nas faltas");
  const sql = read("supabase/migrations/20261110120000_hr_audit_fixes.sql");
  assert.ok(sql.includes("p_vacation_days numeric"));
  assert.ok(sql.includes("'absences', v_absences, 'vacation_days', v_vac_days, 'vacation', v_vacation"));
  assert.ok(sql.includes("Faltas mais dias de férias não podem passar de 31 dias"));
  // a versão antiga (11 parâmetros) é removida para não ficarem duas
  assert.ok(sql.includes("drop function if exists public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb)"));
});

test("o holerite mostra dias de férias em linha própria, e não como falta", () => {
  const page = read("src/app/(app)/app/rh/pagamentos/[id]/page.tsx");
  assert.ok(page.includes("pagos no recibo de férias"));
  assert.ok(page.includes("db.vacation"));
});

test("recibo próprio de férias e de 13º, com o 1/3 e os impostos discriminados", () => {
  const page = read("src/app/(app)/app/rh/pagamentos/[id]/page.tsx");
  assert.ok(page.includes('"Recibo de férias"'));
  assert.ok(page.includes("Adicional de 1/3"));
  assert.ok(page.includes("Avos"), "o 13º mostra os avos");
  assert.ok(page.includes("a 1ª parcela é paga sem descontos"));
});

test("as listas dizem de que tipo é cada pagamento", () => {
  const list = read("src/app/(app)/app/rh/pagamentos/page.tsx");
  assert.ok(list.includes("paymentTitle(payment)") && list.includes("PAYMENT_KIND_LABELS"));
  assert.ok(read("src/app/(app)/app/rh/page.tsx").includes("paymentTitle(payment)"));
});

test("o formulário de férias avisa antes de enviar (regra que estava só no banco)", () => {
  const forms = read("src/components/app/hr-forms.tsx");
  assert.ok(forms.includes("validateVacationSplit("), "usa a regra pura no navegador");
  assert.ok(forms.includes("disabled={Boolean(localError)}"), "não deixa enviar o que o banco vai recusar");
});

// ---- Rodada de testes reais (10/11/2026): guardas do RH e da Agenda ----
import { readFileSync as _read } from "node:fs";
{
  const hr = _read(new URL("../../src/lib/hr/actions.ts", import.meta.url), "utf8");
  const ag = _read(new URL("../../src/lib/agenda/actions.ts", import.meta.url), "utf8");
  test("RH: inativar não engole o erro e respeita a data de início", () => {
    assert.ok(!/if \(!error\) \{\s*\}/.test(hr), "bloco vazio que descarta erro");
    assert.ok(hr.includes('erro=status'));
    assert.ok(hr.includes("startedOn > today ? startedOn : today"));
  });
  test("RH: presença antes da admissão e telefone inválido são recusados", () => {
    assert.ok(hr.includes("Não dá para marcar presença antes disso"));
    assert.ok(hr.includes("Telefone inválido"));
  });
  test("Agenda: não conclui atendimento de dia futuro", () => {
    assert.ok(ag.includes("é de um dia futuro"));
  });
}

{
  const hr = _read(new URL("../../src/lib/hr/actions.ts", import.meta.url), "utf8");
  const q = _read(new URL("../../src/lib/hr/queries.ts", import.meta.url), "utf8");
  test("RH: folha em lote reaproveita o fechamento individual e o painel avisa folha pendente", () => {
    assert.ok(hr.includes("closePayrollBatchAction") && hr.includes("await closePayrollCore(form)"));
    assert.ok(q.includes("unclosedPayroll"));
  });
}
