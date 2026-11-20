import test from "node:test";
import assert from "node:assert/strict";
import { cleanText, requiredText, boundedMoney, boundedQuantity, MAX_MONEY, MAX_QUANTITY } from "../../src/lib/validations/common.ts";
import { readFileSync } from "node:fs";

test("cleanText tira controle e direção invisível, mas mantém acento, emoji e quebra de linha", () => {
  assert.equal(cleanText("ab\u0007c‮d​e﻿f"), "abcdef");
  assert.equal(cleanText("Pão 🧴\nlinha"), "Pão 🧴\nlinha");
});

test("nome obrigatório: só espaços ou só caracteres invisíveis são rejeitados", () => {
  const s = requiredText("obrigatório", 10);
  assert.equal(s.safeParse("   ").success, false);
  assert.equal(s.safeParse("​‮").success, false);
  assert.equal(s.parse("  oi‮  "), "oi");
  assert.equal(s.safeParse("x".repeat(11)).success, false);
});

test("dinheiro e quantidade respeitam o limite das colunas do banco", () => {
  assert.equal(boundedMoney("preço").safeParse(String(MAX_MONEY)).success, true);
  const over = boundedMoney("preço").safeParse("1000000000000");
  assert.equal(over.success, false);
  assert.match(over.error.issues[0].message, /grande demais/);
  assert.equal(boundedMoney("preço").safeParse("-1").success, false);
  assert.equal(boundedQuantity("estoque").safeParse(String(MAX_QUANTITY)).success, true);
  assert.equal(boundedQuantity("estoque").safeParse("1000000000000").success, false);
});

test("o schema de produto usa as validações compartilhadas (nome, textos, dinheiro e quantidade)", () => {
  const src = readFileSync(new URL("../../src/lib/validations/product.ts", import.meta.url), "utf8");
  assert.match(src, /name: requiredText\(/);
  assert.match(src, /salePrice: boundedMoney\(/);
  assert.match(src, /stockQuantity: boundedQuantity\(/);
  assert.match(src, /description: optionalCleanText\(/);
});

test("parse-money: valor acima do limite do banco é detectado antes de chegar ao Postgres", async () => {
  const { isMoneyTooLarge, parseMoneyInput, MAX_MONEY_INPUT } = await import("../../src/lib/parse-money.ts");
  assert.equal(MAX_MONEY_INPUT, MAX_MONEY);
  assert.equal(isMoneyTooLarge("999.999.999,99"), false);
  assert.equal(isMoneyTooLarge("1000000000"), true);
  assert.equal(isMoneyTooLarge("1.000.000.000,00"), true);
  assert.equal(isMoneyTooLarge(""), false);
  assert.equal(isMoneyTooLarge("abc"), false);
  assert.equal(parseMoneyInput("1.280,50"), 1280.5);
});
