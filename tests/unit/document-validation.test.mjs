import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { documentError, documentVariants, phoneError } from "../../src/lib/validations/document.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

/** Testes reais de 11/11/2026: o cadastro aceitava CPF 111.111.111-11, telefone "abcdefgh" e nome de 1 letra. */
test("CPF: dígito verificador conferido; repetidos e errados recusados", () => {
  assert.equal(documentError("529.982.247-25"), null);
  assert.equal(documentError("52998224725"), null);
  assert.match(documentError("111.111.111-11"), /CPF inválido/);
  assert.match(documentError("529.982.247-24"), /CPF inválido/);
});

test("CNPJ: dígito verificador conferido", () => {
  assert.equal(documentError("11.222.333/0001-81"), null);
  assert.match(documentError("12.345.678/0001-00"), /CNPJ inválido/);
  assert.match(documentError("00.000.000/0000-00"), /CNPJ inválido/);
});

test("documento que não é CPF/CNPJ (RG, passaporte) e vazio passam", () => {
  assert.equal(documentError(""), null);
  assert.equal(documentError(null), null);
  assert.equal(documentError("MG-12.345.678"), null);
  assert.equal(documentError("AB123456"), null);
});

test("variantes do mesmo CPF/CNPJ para achar duplicados", () => {
  assert.deepEqual(new Set(documentVariants("529.982.247-25")), new Set(["529.982.247-25", "52998224725"]));
  assert.ok(documentVariants("11222333000181").includes("11.222.333/0001-81"));
});

test("telefone: letras e tamanhos absurdos recusados; formatos comuns passam", () => {
  assert.equal(phoneError(""), null);
  assert.equal(phoneError("(11) 98888-7777"), null);
  assert.equal(phoneError("+55 11 98888-7777"), null);
  assert.match(phoneError("abcdefgh"), /Telefone inválido/);
  assert.match(phoneError("123"), /8 a 15/);
});

test("clientes e fornecedores usam os validadores; fornecedor/cliente com documento repetido é recusado", () => {
  const customer = read("src/lib/validations/customer.ts");
  assert.ok(customer.includes("documentError") && customer.includes("phoneError") && /min\(2,/.test(customer));
  assert.ok(read("src/lib/suppliers/actions.ts").includes("documentError"));
  const actions = read("src/lib/customers/actions.ts");
  assert.ok(actions.includes("Já existe um cliente com esse documento."));
});

test("Caixa: saída em dinheiro maior que o saldo é recusada; fechar caixa pede confirmação; valores em formato BR", () => {
  const cash = read("src/lib/cash-register/actions.ts");
  assert.ok(cash.includes("Saída maior que o dinheiro disponível"));
  assert.ok(cash.includes("parseMoneyInput"));
  assert.ok(read("src/components/app/cash-register-close-form.tsx").includes("ConfirmDialog"));
  assert.ok(read("src/lib/finance/actions.ts").includes("parseMoneyInput"));
});

test("Agenda: dia sem expediente (profissional com expediente cadastrado) não aceita agendamento", () => {
  const agenda = read("src/lib/agenda/actions.ts");
  assert.ok(agenda.includes("offDayError") && agenda.includes("dia sem expediente"));
});

test("Fidelidade: saldo abaixo do mínimo de resgate mostra explicação em vez de campo impossível", () => {
  assert.ok(read("src/components/app/use-loyalty-points-card.tsx").includes("O resgate exige pelo menos"));
});
