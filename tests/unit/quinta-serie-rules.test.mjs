import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROFESSIONAL_COLORS,
  blockWindowError,
  memberEmailSchema,
  parseServiceOverrides,
  professionalProfileSchema,
} from "../../src/lib/validations/team.ts";

const read = (rel) => readFileSync(rel, "utf8");
const profile = (input) =>
  professionalProfileSchema.safeParse({ displayName: "Rafael Lima", phone: "", specialty: "", color: "sky", notes: "", active: true, ...input });
const firstError = (input) => {
  const result = profile(input);
  return result.success ? null : result.error.issues[0].message;
};

/** 5ª série (20/11/2026): Equipe aceitava qualquer texto na ficha do profissional. */
test("ficha do profissional: nome obrigatório, com letras, até 120, sem espaços repetidos nem invisíveis", () => {
  assert.match(firstError({ displayName: "" }), /nome do profissional/);
  assert.match(firstError({ displayName: "     " }), /nome do profissional/);
  assert.match(firstError({ displayName: "12345" }), /com letras/);
  assert.match(firstError({ displayName: "R" + "a".repeat(120) }), /muito longo/);
  assert.equal(profile({ displayName: "Rafael    T5     Lima" }).data.displayName, "Rafael T5 Lima");
  assert.equal(profile({ displayName: "Rafael‮ T5​ Lima" }).data.displayName, "Rafael T5 Lima");
  assert.equal(profile({ displayName: "José Ávila ✂️" }).success, true);
});

test("ficha do profissional: telefone, especialidade, observações e cor", () => {
  assert.match(firstError({ phone: "abc123" }), /Telefone inválido/);
  assert.match(firstError({ phone: "123" }), /Telefone inválido/);
  assert.match(firstError({ phone: "1".repeat(60) }), /Máximo de 32/);
  assert.equal(profile({ phone: "(11) 95555-4444" }).success, true);
  assert.match(firstError({ specialty: "a".repeat(121) }), /Máximo de 120/);
  assert.match(firstError({ notes: "a".repeat(1001) }), /máximo de 1000/);
  assert.equal(profile({ notes: "a\n\nb​c" }).data.notes, "a\n\nbc");
  assert.equal(profile({ color: "rose" }).data.color, "rose");
  assert.equal(profile({ color: "qualquer-coisa" }).data.color, "sky");
  assert.deepEqual([...PROFESSIONAL_COLORS], ["sky", "emerald", "violet", "amber", "rose", "slate"]);
});

const SID = "4166d683-6ea8-4a32-8bf7-5f6bf07e7f01";
const SID2 = "594c0471-64d0-4955-9942-4b29d7e81522";
const overrides = (rows) => parseServiceOverrides(rows);

test("serviços do profissional: duração e preço personalizados com mensagens claras", () => {
  assert.deepEqual(overrides([{ service_id: SID, duration_override_minutes: "90", price_override: 1280.5 }]), {
    ok: true,
    items: [{ service_id: SID, duration_override_minutes: 90, price_override: 1280.5 }],
  });
  assert.deepEqual(overrides([{ service_id: SID, duration_override_minutes: "", price_override: null }]).items[0], {
    service_id: SID,
    duration_override_minutes: null,
    price_override: null,
  });
  for (const bad of ["abc", "-5", "0", "1441", "1,5", "99999999999", "1e3"]) {
    assert.match(overrides([{ service_id: SID, duration_override_minutes: bad }]).error, /Duração personalizada/, bad);
  }
  assert.match(overrides([{ service_id: SID, price_override: -1 }]).error, /Preço personalizado inválido/);
  assert.match(overrides([{ service_id: SID, price_override: 1e12 }]).error, /muito alto/);
  assert.match(overrides([{ service_id: SID }, { service_id: SID }]).error, /duas vezes/);
  assert.match(overrides([{ service_id: "nao-e-uuid" }]).error, /Serviço inválido/);
  assert.match(overrides("x").error, /inválida/);
  assert.equal(overrides([{ service_id: SID }, { service_id: SID2 }]).items.length, 2);
});

test("bloqueio de horário: datas plausíveis, fim depois do início e no máximo 60 dias", () => {
  const d = (s) => new Date(s + ":00-03:00");
  const check = (a, b) => blockWindowError(a, b, d(a), d(b), 2026);
  assert.equal(check("2027-03-10T12:00", "2027-03-10T13:00"), null);
  assert.match(check("1999-03-10T12:00", "1999-03-10T13:00"), /fora do período/);
  assert.match(check("2099-03-10T12:00", "2099-03-10T13:00"), /fora do período/);
  assert.match(check("2027-03-10T13:00", "2027-03-10T12:00"), /depois do início/);
  assert.match(check("2027-03-10T12:00", "2027-03-10T12:00"), /depois do início/);
  assert.match(check("2027-03-10T12:00", "2027-06-30T12:00"), /no máximo 60 dias/);
  assert.equal(check("2027-03-10T12:00", "2027-05-09T12:00"), null);
});

test("e-mail de colaborador: formato, minúsculas e tamanho", () => {
  assert.equal(memberEmailSchema.parse("  Ana@Empresa.COM "), "ana@empresa.com");
  for (const bad of ["", "semarroba", "a@b", "a b@c.com", "a".repeat(200) + "@x.com"]) {
    assert.equal(memberEmailSchema.safeParse(bad).success, false, bad);
  }
});

test("ações da Equipe usam as regras novas e valida horários da semana", () => {
  const src = read("src/lib/team/actions.ts");
  assert.ok(src.includes("professionalProfileSchema.safeParse"));
  assert.ok(src.includes("parseServiceOverrides(parsedServices)"));
  assert.ok(src.includes("availabilityError(schedule)"));
  assert.ok(src.includes("blockWindowError("));
  assert.ok(src.includes("memberEmailSchema.safeParse"));
  assert.ok(src.includes("Há dois períodos que se sobrepõem no mesmo dia."));
});

test("serviços do profissional: preço digitado como texto é lido (1.280,50) e texto inválido avisa", () => {
  const price = (v) => parseServiceOverrides([{ service_id: SID, price_override: v }]);
  assert.equal(price("1.280,50").items[0].price_override, 1280.5);
  assert.equal(price("60").items[0].price_override, 60);
  assert.equal(price("").items[0].price_override, null);
  assert.match(price("abc").error, /Preço personalizado inválido/);
  assert.match(price("-5").error, /Preço personalizado inválido/);
  assert.match(price("99999999999").error, /muito alto/);
});

test("Financeiro: fração de centavo é recusada em vez de arredondada em silêncio", async () => {
  const { hasFractionOfCent, FRACTION_OF_CENT_MESSAGE } = await import("../../src/lib/parse-money.ts");
  assert.equal(hasFractionOfCent("0,005"), true);
  assert.equal(hasFractionOfCent("10,999"), true);
  assert.equal(hasFractionOfCent("10.001"), true);
  for (const ok of ["10", "10,5", "10,50", "1.234,56", "0,01", "", "abc", null, undefined]) assert.equal(hasFractionOfCent(ok), false, String(ok));
  assert.match(FRACTION_OF_CENT_MESSAGE, /2 casas decimais/);
  const fin = readFileSync("src/lib/finance/actions.ts", "utf8");
  assert.equal((fin.match(/hasFractionOfCent\(textValue\(formData\.get\("amount"\)\)\)/g) ?? []).length, 2);
});

test("Assinatura: cobrança recusa teste grátis e vitalício com mensagem própria; Equipe: bloqueio não duplica", () => {
  const route = readFileSync("src/app/api/billing/create-payment/route.ts", "utf8");
  assert.ok(route.includes("O teste grátis não é contratado"));
  assert.ok(route.includes("O acesso vitalício é concedido pelo suporte"));
  const team = readFileSync("src/lib/team/actions.ts", "utf8");
  assert.ok(team.includes("Já existe um bloqueio neste horário."));
  assert.ok(team.includes('.from("professional_blocks")'));
});

test("Compras: datas do pedido (ano, calendário e vencimento depois da previsão)", async () => {
  const { purchaseDatesError } = await import("../../src/lib/validations/purchase-dates.ts");
  const e = (a, b) => purchaseDatesError(a, b, 2026);
  assert.equal(e("", ""), null);
  assert.equal(e("2026-12-20", "2026-12-20"), null);
  assert.equal(e("2026-12-20", "2027-01-10"), null);
  assert.equal(e("", "2025-06-01"), null);
  assert.match(e("", "2099-01-01"), /Vencimento fora do período/);
  assert.match(e("2020-01-01", ""), /Previsão de entrega fora do período/);
  assert.match(e("2026-12-20", "2026-12-01"), /antes da previsão/);
  assert.match(e("2026-02-30", ""), /Previsão de entrega inválida/);
  assert.match(e("", "01/12/2026"), /Vencimento inválido/);
  assert.ok(readFileSync("src/lib/purchases/actions.ts", "utf8").includes("purchaseDatesError("));
});

test("Chat: depois do resumo, mensagem curta com o nome troca o profissional; duração absurda avisa", async () => {
  const { runAgendarTurn, emptyState } = await import("../../src/lib/chat/agenda-turn.ts");
  const { parseExtras } = await import("../../src/lib/chat/agenda-agendar.ts");
  const { CLOCK, CATALOG, PORTS } = await import("../chat-bateria/fixture-teste1.mjs");
  const first = "agendar corte para João Pedro amanhã às 10h com Ana";
  const proAfter = async (text) => {
    const start = (await runAgendarTurn({ text: first, state: emptyState(), catalog: CATALOG, clock: CLOCK }, PORTS)).state;
    const turn = await runAgendarTurn({ text, state: JSON.parse(JSON.stringify(start)), catalog: CATALOG, clock: CLOCK }, PORTS);
    return turn.state.slots.profissional?.name;
  };
  for (const phrase of ["troca para o Felipe", "trocar pro Felipe", "muda para o Felipe", "pode ser o Felipe", "Felipe", "prefiro o Felipe", "na verdade o Felipe"]) {
    assert.equal(await proAfter(phrase), "Felipe Oliveira", phrase);
  }
  for (const phrase of ["obs: trazer o Felipe", "valor 60", "sexta às 15h", "Ana"]) {
    assert.equal(await proAfter(phrase), "Ana Paula Souza", phrase);
  }
  assert.deepEqual(parseExtras("por 20 horas").unsupported, ["duracao-invalida"]);
  assert.deepEqual(parseExtras("por 1 minuto").unsupported, ["duracao-invalida"]);
  assert.deepEqual(parseExtras("por 2 horas").unsupported, []);
  assert.equal(parseExtras("por 2 horas").durationMinutes, 120);
});
