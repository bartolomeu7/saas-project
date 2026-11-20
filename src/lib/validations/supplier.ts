import { z } from "zod";
import { documentError, phoneError } from "./document.ts";
import { cleanText, collapseSpaces, requiredText } from "./common.ts";
import { BRAZIL_UFS } from "./brazil-ufs.ts";

/** Texto opcional do formulário: limpa caracteres invisíveis, apara e devolve "" quando vazio (as colunas aceitam texto vazio). */
const optionalField = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => cleanText(value ?? "").trim())
    .pipe(z.string().max(max, `Máximo de ${max} caracteres.`));

/**
 * Cadastro de fornecedor. Os limites acompanham o banco (nome até 180) e o cadastro de clientes:
 * sem eles o servidor aceitava 5.000 caracteres, e-mail sem "@", UF "XX", CEP de 3 números etc.
 */
export const supplierSchema = z.object({
  name: requiredText("Informe o nome do fornecedor.", 180, "Nome muito longo (máximo 180 caracteres).").refine(
    (value) => /\p{L}/u.test(value),
    "Informe um nome válido (com letras)."
  ),
  legal_name: z
    .string()
    .nullish()
    .transform((value) => collapseSpaces(cleanText(value ?? "")).trim())
    .pipe(z.string().max(180, "Razão social muito longa (máximo 180 caracteres).")),
  document: optionalField(32).superRefine((value, ctx) => {
    const problem = documentError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  email: optionalField(160)
    .transform((value) => value.toLowerCase())
    .refine((value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), { message: "Informe um e-mail válido." }),
  phone: optionalField(32).superRefine((value, ctx) => {
    const problem = phoneError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  whatsapp: optionalField(32).superRefine((value, ctx) => {
    const problem = phoneError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WhatsApp: " + problem.charAt(0).toLowerCase() + problem.slice(1) });
  }),
  address: optionalField(200),
  address_number: optionalField(20).refine((value) => !value.startsWith("-"), { message: "Número do endereço inválido." }),
  complement: optionalField(100),
  neighborhood: optionalField(100),
  city: optionalField(100).refine((value) => value === "" || /\p{L}/u.test(value), { message: "Informe uma cidade válida (com letras)." }),
  state: optionalField(2)
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || (BRAZIL_UFS as readonly string[]).includes(value), { message: "UF inválida (use a sigla, ex.: SP)." }),
  postal_code: optionalField(16).refine((value) => value === "" || value.replace(/\D/g, "").length === 8, {
    message: "CEP inválido: use 8 números.",
  }),
  notes: optionalField(2000),
  status: z.enum(["active", "inactive"]).catch("active"),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
