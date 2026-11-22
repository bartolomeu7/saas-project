import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkBillingProfile, documentProblem, formatDocument, formatPhone, phoneProblem } from "../../src/lib/billing/checkout-profile.ts";
import { buildBuyer } from "../../src/lib/billing/buyer.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("checkout: CPF/CNPJ e telefone pedidos ao cliente", () => {
  it("formata CPF, CNPJ e telefone (fixo e celular); o resto volta como veio", () => {
    assert.equal(formatDocument("52998224725"), "529.982.247-25");
    assert.equal(formatDocument("11222333000181"), "11.222.333/0001-81");
    assert.equal(formatDocument(" 123 "), "123");
    assert.equal(formatPhone("11999998888"), "(11) 99999-8888");
    assert.equal(formatPhone("+55 11 3333-4444"), "(11) 3333-4444");
    assert.equal(formatPhone("abc"), "abc");
  });

  it("CPF/CNPJ: confere o dígito verificador e diz o que está errado", () => {
    assert.equal(documentProblem("529.982.247-25"), null);
    assert.equal(documentProblem("11.222.333/0001-81"), null);
    assert.match(documentProblem("111.111.111-11"), /CPF inválido/);
    assert.match(documentProblem("11.222.333/0001-82"), /CNPJ inválido/);
    assert.match(documentProblem("123"), /11 números|14 números/);
    assert.match(documentProblem(""), /Informe/);
    assert.match(documentProblem("   "), /Informe/);
  });

  it("telefone: exige DDD + número", () => {
    assert.equal(phoneProblem("(11) 99999-8888"), null);
    assert.equal(phoneProblem("1133334444"), null);
    assert.match(phoneProblem("99999-8888"), /inválido/);
    assert.match(phoneProblem("00999998888"), /inválido/);
    assert.match(phoneProblem(""), /Informe/);
  });

  it("checkBillingProfile confere SÓ o que foi enviado e devolve já formatado", () => {
    assert.deepEqual(checkBillingProfile({ document: "52998224725", phone: "11999998888" }), { ok: true, document: "529.982.247-25", phone: "(11) 99999-8888" });
    assert.deepEqual(checkBillingProfile({ phone: "11999998888" }), { ok: true, document: undefined, phone: "(11) 99999-8888" });
    assert.deepEqual(checkBillingProfile({ document: "52998224725" }), { ok: true, document: "529.982.247-25", phone: undefined });
    assert.deepEqual(checkBillingProfile({}), { ok: true, document: undefined, phone: undefined });
  });

  it("erros por campo, sem gravar nada quando algum está inválido", () => {
    const r = checkBillingProfile({ document: "111.111.111-11", phone: "123" });
    assert.equal(r.ok, false);
    assert.match(r.errors.document, /CPF inválido/);
    assert.match(r.errors.phone, /inválido/);
    const onlyPhone = checkBillingProfile({ document: "52998224725", phone: "123" });
    assert.equal(onlyPhone.ok, false);
    assert.equal(onlyPhone.errors.document, undefined);
  });

  it("o que o checkout salva é exatamente o que o servidor de pagamento aceita (mesma regra do buildBuyer)", () => {
    const saved = checkBillingProfile({ document: "529.982.247-25", phone: "(11) 99999-8888" });
    assert.equal(saved.ok, true);
    const buyer = buildBuyer({ companyName: "Oficina", legalName: null, document: saved.document, phone: saved.phone, whatsapp: null, companyEmail: null, userEmail: "ze@oficina.com" });
    assert.equal(buyer.ok, true);
    assert.equal(buyer.buyer.document, "52998224725");
    assert.equal(buyer.buyer.phone, "11999998888");
  });
});

describe("fiação do checkout (leitura do código)", () => {
  const action = read("src/lib/billing/actions.ts");
  const card = read("src/components/app/plan-card.tsx");
  const form = read("src/components/app/checkout-form.tsx");
  const page = read("src/app/(app)/app/assinatura/checkout/[planId]/page.tsx");

  it("'Assinar' leva ao checkout com o plano; nenhum preço trafega do navegador", () => {
    assert.match(card, /\/app\/assinatura\/checkout\/\$\{plan\.id\}\?method=/);
    assert.doesNotMatch(card, /fetch\(/, "o cartão do plano não cria cobrança: só navega");
    assert.doesNotMatch(form, /amount|price/i);
    assert.match(form, /JSON\.stringify\(\{ planId, method \}\)/);
  });

  it("o formulário salva os dados ANTES de criar a cobrança e só envia os campos mostrados", () => {
    assert.ok(form.indexOf("saveBillingProfileAction(") < form.indexOf('"/api/billing/create-payment"'));
    assert.match(form, /needsDocument \? \{ document \} : \{\}/);
    assert.match(form, /needsPhone \? \{ phone \} : \{\}/);
  });

  it("a ação só deixa proprietário/administrador salvar e preserva os demais dados do cadastro (a função do banco troca tudo)", () => {
    const body = action.slice(action.indexOf("export async function saveBillingProfileAction"));
    assert.match(body, /current\.role !== "owner" && current\.role !== "admin"/);
    for (const field of ["legal_name", "whatsapp", "email", "website", "postal_code", "address", "address_number", "complement", "neighborhood", "city", "state"]) {
      assert.match(body, new RegExp(`company\\.${field} \\?\\? ""`), field);
    }
    assert.match(body, /checked\.document \?\? company\.document \?\? ""/);
    assert.match(body, /checked\.phone \?\? company\.phone \?\? ""/);
  });

  it("a página confere que o plano é vendável (mesmas regras da rota) e só mostra os campos que faltam", () => {
    for (const rule of ["plan.status === \"active\"", "!plan.trial", "!plan.lifetime", 'plan.code !== "CUSTOM"', "Number(plan.price) > 0", "plan.access_duration_days !== null"]) {
      assert.ok(page.includes(rule), rule);
    }
    assert.match(page, /missing\.includes\("documento"\)/);
    assert.match(page, /missing\.includes\("telefone"\)/);
  });
});
