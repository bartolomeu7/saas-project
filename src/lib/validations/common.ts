import { z } from "zod";

/**
 * Validações compartilhadas entre os módulos (produtos, serviços, compras, caixa, financeiro...).
 * Os limites acompanham as colunas do banco: dinheiro = numeric(12,2), quantidade = numeric(12,3).
 * Sem eles, um valor gigante estoura o banco ("numeric field overflow") e o usuário só vê "tente novamente".
 */
export const MAX_MONEY = 999_999_999.99;
export const MAX_QUANTITY = 999_999_999.999;

/**
 * Remove caracteres de controle (exceto quebra de linha e tab) e os de direção/formatação invisível do Unicode
 * (U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF). Eles permitem "disfarçar" nomes
 * (texto que aparece invertido ou invisível) e não têm uso legítimo em nome, descrição ou observação.
 */
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "");
}

/** Texto obrigatório: limpa, apara as pontas e exige ao menos 1 caractere. */
export const requiredText = (requiredMessage: string, max: number, tooLongMessage = "Texto muito longo.") =>
  z
    .string()
    .transform((v) => cleanText(v).trim())
    .pipe(z.string().min(1, requiredMessage).max(max, tooLongMessage));

/** Texto opcional: limpa, apara e devolve null quando vazio. */
export const optionalCleanText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => cleanText(v ?? "").trim())
    .pipe(z.string().max(max, `Máximo de ${max} caracteres.`))
    .transform((v) => (v ? v : null));

export const boundedMoney = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Informe um valor válido para ${label}.` })
    .min(0, `${label} não pode ser negativo.`)
    .max(MAX_MONEY, `${label} é grande demais (máximo ${MAX_MONEY.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`);

export const boundedQuantity = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Informe uma quantidade válida para ${label}.` })
    .min(0, `${label} não pode ser negativo.`)
    .max(MAX_QUANTITY, `${label} é grande demais (máximo ${MAX_QUANTITY.toLocaleString("pt-BR")}).`);
