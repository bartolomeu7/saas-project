import { z } from "zod";

/**
 * Formulário de plano do admin -> payload da RPC admin_save_plan.
 *
 * Módulo PURO (sem "use server"/server-only): é usado pelo editor (validação imediata) e pela Server Action
 * (validação de formato) e é testado direto no Node. NENHUMA regra comercial é decidida aqui — preço mínimo, desconto
 * válido, plano personalizado sem preço, janela de promoção etc. são impostas pelo BANCO (admin_save_plan + CHECKs);
 * o zod só garante tipos, tamanhos e conversões (vírgula decimal, data de Brasília -> ISO).
 */

export const BENEFIT_MAX = 20;
export const BENEFIT_TEXT_MAX = 140;

/** Aceita "89,90", "1.234,56" e "89.90". Vazio => null; ilegível => NaN (recusado abaixo). Nada de float acumulado: só 1 conversão. */
export function parseMoney(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const money = z
  .string()
  .transform(parseMoney)
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000), "Valor monetário inválido.")
  .refine((v) => v === null || Math.round(v * 100) / 100 === v, "Use no máximo 2 casas decimais.");

const intField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} inválido.`)
    .transform(Number)
    .refine((v) => v <= max, `${label} inválido.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

/** "2026-10-20T10:00" (campo datetime-local, horário de Brasília, UTC-3 sem horário de verão) -> ISO UTC. */
export function brasiliaLocalToIso(local: string): string | null {
  const v = local.trim();
  if (v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error("Data inválida.");
  const date = new Date(`${v}:00-03:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida.");
  return date.toISOString();
}

/** ISO UTC -> valor de campo datetime-local em Brasília. */
export function isoToBrasiliaLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

const benefitSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1, "Cada benefício precisa de um texto.").max(BENEFIT_TEXT_MAX, `Benefício: no máximo ${BENEFIT_TEXT_MAX} caracteres.`),
  highlighted: z.boolean().default(false),
  visible: z.boolean().default(true),
  included: z.boolean().default(true),
});

export const planFormSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Código inválido (A-Z, 0-9 e _; 2 a 32 caracteres).")
    .optional(),
  name: z.string().trim().min(1, "Informe o nome do plano.").max(80, "Nome: no máximo 80 caracteres."),
  description: optionalText(500, "Descrição"),
  price: money,
  accessDurationDays: z.string().trim().transform((v) => (v === "" ? null : v)).pipe(z.union([z.null(), intField("Duração", 3660)])),
  billingInterval: z.enum(["", "month", "year"]).transform((v) => (v === "" ? null : v)),
  additionalUserLimit: intField("Limite de usuários", 1000),
  sortOrder: intField("Ordem", 10_000),
  trial: z.boolean(),
  supportEnabled: z.boolean(),
  ticketsEnabled: z.boolean(),
  exclusiveGroupsEnabled: z.boolean(),
  earlyAccessEnabled: z.boolean(),
  status: z.enum(["active", "inactive"]),
  publicVisible: z.boolean(),
  tagline: optionalText(60, "Texto auxiliar"),
  highlight: z.enum(["", "popular", "value"]).transform((v) => (v === "" ? null : v)),
  ctaLabel: optionalText(40, "Texto do botão"),
  contactUrl: optionalText(500, "Destino de contato"),
  benefitsTitle: optionalText(80, "Título dos benefícios"),
  comparePrice: money,
  promoEnabled: z.boolean(),
  promoStartsAt: z.string().transform((v, ctx) => {
    try { return brasiliaLocalToIso(v); } catch { ctx.addIssue({ code: "custom", message: "Início da promoção inválido." }); return z.NEVER; }
  }),
  promoEndsAt: z.string().transform((v, ctx) => {
    try { return brasiliaLocalToIso(v); } catch { ctx.addIssue({ code: "custom", message: "Término da promoção inválido." }); return z.NEVER; }
  }),
  showComparePrice: z.boolean(),
  showDiscountPercent: z.boolean(),
  applyLimitsToExisting: z.boolean().default(false),
  benefits: z.array(benefitSchema).max(BENEFIT_MAX, `No máximo ${BENEFIT_MAX} benefícios.`),
});

export type PlanFormInput = z.input<typeof planFormSchema>;

export type PlanPayloadResult = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

/** Valida o formato e monta o payload snake_case de admin_save_plan. O banco continua sendo a autoridade. */
export function buildPlanPayload(input: unknown, options: { creating: boolean }): PlanPayloadResult {
  const parsed = planFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message && issue.message !== "Required" ? issue.message : "Parâmetros inválidos." };
  }
  const d = parsed.data;
  if (options.creating && !d.code) return { ok: false, error: "Informe o código do plano." };

  const payload: Record<string, unknown> = {
    name: d.name,
    description: d.description,
    price: d.price,
    access_duration_days: d.accessDurationDays,
    billing_interval: d.billingInterval,
    additional_user_limit: d.additionalUserLimit,
    sort_order: d.sortOrder,
    trial: d.trial,
    support_enabled: d.supportEnabled,
    tickets_enabled: d.ticketsEnabled,
    exclusive_groups_enabled: d.exclusiveGroupsEnabled,
    early_access_enabled: d.earlyAccessEnabled,
    status: d.status,
    public_visible: d.publicVisible,
    tagline: d.tagline,
    highlight: d.highlight,
    cta_label: d.ctaLabel,
    contact_url: d.contactUrl,
    benefits_title: d.benefitsTitle,
    compare_price: d.comparePrice,
    promo_enabled: d.promoEnabled,
    promo_starts_at: d.promoStartsAt,
    promo_ends_at: d.promoEndsAt,
    show_compare_price: d.showComparePrice,
    show_discount_percent: d.showDiscountPercent,
    apply_limits_to_existing: d.applyLimitsToExisting,
    benefits: d.benefits.map((b) => ({ ...(b.id ? { id: b.id } : {}), text: b.text, highlighted: b.highlighted, visible: b.visible, included: b.included })),
  };
  if (options.creating) payload.code = d.code;
  return { ok: true, payload };
}
