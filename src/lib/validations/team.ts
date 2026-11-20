import { z } from "zod";
import { phoneError } from "./document.ts";
import { cleanText, collapseSpaces, MAX_MONEY, requiredText } from "./common.ts";
import { parseMoneyInput } from "../parse-money.ts";

/** Cores aceitas na agenda (as mesmas opções do formulário). */
export const PROFESSIONAL_COLORS = ["sky", "emerald", "violet", "amber", "rose", "slate"] as const;

const optionalField = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => collapseSpaces(cleanText(value ?? "")).trim())
    .pipe(z.string().max(max, `Máximo de ${max} caracteres.`));

/**
 * Ficha do profissional. Antes o servidor aceitava nome de 500 letras ou "12345", telefone "abc123" e observações
 * de 20.000 caracteres, e qualquer texto como cor (a agenda ficava sem cor).
 */
export const professionalProfileSchema = z.object({
  displayName: requiredText("Informe o nome do profissional.", 120, "Nome muito longo (máximo 120 caracteres).").refine(
    (value) => /\p{L}/u.test(value),
    "Informe um nome válido (com letras)."
  ),
  phone: optionalField(32).superRefine((value, ctx) => {
    const problem = phoneError(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  specialty: optionalField(120),
  color: z.enum(PROFESSIONAL_COLORS).catch("sky"),
  notes: z
    .string()
    .nullish()
    .transform((value) => cleanText(value ?? "").trim())
    .pipe(z.string().max(1000, "Observações: máximo de 1000 caracteres.")),
  active: z.boolean(),
});

export const MAX_SERVICE_DURATION_MINUTES = 24 * 60;

export interface ServiceOverrideInput {
  service_id: string;
  duration_override_minutes: number | null;
  price_override: number | null;
}

/**
 * Serviços atendidos pelo profissional, com duração/preço personalizados opcionais.
 * Devolve a lista limpa ou a mensagem do primeiro problema (antes: "invalid input syntax for type integer",
 * "numeric field overflow" e "violates check constraint" chegavam crus ao usuário).
 */
export function parseServiceOverrides(raw: unknown): { ok: true; items: ServiceOverrideInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Configuração de serviços inválida." };
  if (raw.length > 200) return { ok: false, error: "Serviços demais na lista." };
  const seen = new Set<string>();
  const items: ServiceOverrideInput[] = [];
  for (const entry of raw) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const serviceId = typeof row.service_id === "string" ? row.service_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId)) return { ok: false, error: "Serviço inválido." };
    if (seen.has(serviceId)) return { ok: false, error: "O mesmo serviço foi marcado duas vezes." };
    seen.add(serviceId);

    let duration: number | null = null;
    const rawDuration = row.duration_override_minutes;
    if (rawDuration !== null && rawDuration !== undefined && String(rawDuration).trim() !== "") {
      const text = String(rawDuration).trim();
      const minutes = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SERVICE_DURATION_MINUTES) {
        return { ok: false, error: "Duração personalizada: use minutos inteiros de 1 a 1440." };
      }
      duration = minutes;
    }

    let price: number | null = null;
    const rawPrice = row.price_override;
    if (rawPrice !== null && rawPrice !== undefined && String(rawPrice).trim() !== "") {
      // texto digitado ("1.280,50", "abc", "-5") ou número; texto inválido não pode ser ignorado em silêncio
      const value = typeof rawPrice === "number" ? rawPrice : parseMoneyInput(String(rawPrice)) ?? NaN;
      if (!Number.isFinite(value) || value < 0) return { ok: false, error: "Preço personalizado inválido (use zero ou mais)." };
      if (value > MAX_MONEY) return { ok: false, error: "Preço personalizado muito alto (máximo R$ 999.999.999,99)." };
      price = Math.round(value * 100) / 100;
    }
    items.push({ service_id: serviceId, duration_override_minutes: duration, price_override: price });
  }
  return { ok: true, items };
}

/** Bloqueio de horário: datas plausíveis (de 2 anos atrás a 3 à frente), fim depois do início e até 60 dias. */
export const MAX_BLOCK_DAYS = 60;

export function blockWindowError(startsLocal: string, endsLocal: string, startsAt: Date, endsAt: Date, currentYear: number): string | null {
  const startYear = Number(startsLocal.slice(0, 4));
  const endYear = Number(endsLocal.slice(0, 4));
  for (const year of [startYear, endYear]) {
    if (!Number.isFinite(year) || year < currentYear - 2 || year > currentYear + 3) {
      return "Data fora do período permitido (de 2 anos atrás a 3 anos à frente).";
    }
  }
  if (endsAt.getTime() <= startsAt.getTime()) return "O fim do bloqueio deve ser depois do início.";
  if (endsAt.getTime() - startsAt.getTime() > MAX_BLOCK_DAYS * 24 * 60 * 60 * 1000) {
    return `O bloqueio pode ter no máximo ${MAX_BLOCK_DAYS} dias. Para períodos maiores, desative o profissional.`;
  }
  return null;
}

export const memberEmailSchema = z
  .string()
  .transform((value) => cleanText(value).trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "Informe o e-mail do colaborador.")
      .max(160, "E-mail muito longo.")
      .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Informe um e-mail válido.")
  );

export const blockReasonSchema = optionalField(200);
