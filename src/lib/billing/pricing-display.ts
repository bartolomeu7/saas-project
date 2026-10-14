import type { PublicPlan } from "@/types/billing";

/**
 * Centavos inteiros — MESMA semântica de toCents() em amount.ts (há teste de paridade). Fica local para que este módulo
 * puro não precise de import com extensão/alias e possa ser testado direto no Node.
 */
function toCents(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    n = Number(text.replace(",", "."));
  } else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Exibição comercial de planos (site público, tela de planos do app e pré-visualização do admin).
 *
 * Regras de dinheiro: SEMPRE centavos inteiros (nunca float) — o mesmo critério de amount.ts. O percentual de
 * desconto é calculado no BANCO (plan_discount_percent / get_public_plans); esta função espelha a fórmula só para
 * a pré-visualização do admin e para os testes de paridade. O preço COBRADO nunca sai daqui: o checkout lê o preço
 * do plano no servidor (claim_subscription_payment).
 */

/** Percentual de desconto com 1 casa, arredondado como o banco (metade para cima). null = não há desconto válido. */
export function discountPercent(price: unknown, comparePrice: unknown): number | null {
  const p = toCents(price);
  const c = toCents(comparePrice);
  if (p === null || c === null || p <= 0 || c <= 0 || c <= p) return null;
  // ((c - p) / c) * 100 com 1 casa = round((c - p) * 1000 / c) / 10, só com inteiros
  const tenths = Math.floor((2 * (c - p) * 1000 + c) / (2 * c));
  return tenths / 10;
}

/** Economia em reais (centavos exatos) ou null quando não há desconto válido. */
export function savingsAmount(price: unknown, comparePrice: unknown): number | null {
  if (discountPercent(price, comparePrice) === null) return null;
  return ((toCents(comparePrice) as number) - (toCents(price) as number)) / 100;
}

export type PromoState = "none" | "scheduled" | "active" | "expired";

/** Mesma regra de plan_promo_state() no banco. */
export function promoState(enabled: boolean, startsAt: string | null, endsAt: string | null, at: Date = new Date()): PromoState {
  if (!enabled) return "none";
  if (startsAt && new Date(startsAt).getTime() > at.getTime()) return "scheduled";
  if (endsAt && new Date(endsAt).getTime() <= at.getTime()) return "expired";
  return "active";
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatPlanPrice(price: number): string {
  return BRL.format(price).replace(/ /g, " ");
}

export function formatDiscountLabel(percent: number): string {
  return `Economize ${percent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Normaliza uma linha de get_public_plans(). Tolerante de propósito: se o código for implantado ANTES da migration, o
 * banco ainda devolve o formato antigo (sem kind/benefits/promoção) e a home continua funcionando com o que existe, em vez
 * de quebrar. Campos desconhecidos são descartados (nada administrativo passa adiante) e tipos inesperados viram null.
 */
export function normalizePublicPlan(row: Record<string, unknown>): PublicPlan {
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const bool = (v: unknown) => v === true;
  const code = String(row.code ?? "");
  const trial = bool(row.trial);
  const kinds = ["standard", "trial", "custom", "lifetime"] as const;
  const kind = kinds.find((k) => k === row.kind) ?? (trial ? "trial" : code === "CUSTOM" ? "custom" : "standard");
  const benefitsRaw = Array.isArray(row.benefits) ? row.benefits : [];
  return {
    id: String(row.id ?? ""),
    code,
    name: String(row.name ?? ""),
    description: str(row.description),
    price: num(row.price),
    currency: String(row.currency ?? "BRL"),
    access_duration_days: num(row.access_duration_days),
    additional_user_limit: num(row.additional_user_limit) ?? 0,
    trial,
    support_enabled: bool(row.support_enabled),
    tickets_enabled: bool(row.tickets_enabled),
    exclusive_groups_enabled: bool(row.exclusive_groups_enabled),
    early_access_enabled: bool(row.early_access_enabled),
    status: row.status === "inactive" ? "inactive" : "active",
    kind,
    tagline: str(row.tagline),
    highlight: row.highlight === "popular" || row.highlight === "value" ? row.highlight : null,
    cta_label: str(row.cta_label),
    contact_url: str(row.contact_url),
    benefits_title: str(row.benefits_title),
    sort_order: num(row.sort_order) ?? 0,
    compare_price: num(row.compare_price),
    discount_percent: num(row.discount_percent),
    savings_amount: num(row.savings_amount),
    promo_ends_at: str(row.promo_ends_at),
    benefits: benefitsRaw
      .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null && typeof (b as { text?: unknown }).text === "string")
      .map((b) => ({ text: String(b.text), highlighted: b.highlighted === true, included: b.included !== false })),
  };
}

export interface PricingLine {
  text: string;
  included: boolean;
  highlighted: boolean;
}

export interface PricingView {
  id: string;
  code: string;
  kind: PublicPlan["kind"];
  name: string;
  tagline: string | null;
  highlight: "popular" | "value" | null;
  /** "R$ 89,00", "R$ 0" (teste) ou "Sob consulta". */
  priceLabel: string;
  periodLabel: string | null;
  comparePriceLabel: string | null;
  discountLabel: string | null;
  savingsLabel: string | null;
  promoEndsAt: string | null;
  description: string | null;
  benefitsTitle: string | null;
  lines: PricingLine[];
  ctaLabel: string;
  /** null = sem destino (botão desabilitado — nunca um link falso). */
  ctaHref: string | null;
  /** O destino é externo (https/mailto): abre com rel seguro. */
  ctaExternal: boolean;
  sortOrder: number;
}

function periodLabelOf(days: number | null): string | null {
  if (days === null) return null;
  return `${days} ${days === 1 ? "dia" : "dias"}`;
}

/**
 * Linhas de recursos REAIS (vindas dos limites/flags do plano, que o sistema de fato aplica) seguidas dos benefícios
 * COMERCIAIS cadastrados. Só "usuários" e "suporte" são apresentados automaticamente: tickets, grupos exclusivos e
 * acesso antecipado ainda não têm funcionalidade correspondente no produto, então não são prometidos aqui.
 */
export function buildPricingLines(plan: PublicPlan): PricingLine[] {
  const lines: PricingLine[] = [];
  const manual = plan.benefits.map((b) => ({ text: b.text, included: b.included, highlighted: b.highlighted }));
  if (plan.kind === "custom") return manual;

  if (plan.additional_user_limit > 0) {
    lines.push({ text: `1 proprietário + até ${plan.additional_user_limit} usuários adicionais`, included: true, highlighted: false });
  } else if (plan.kind === "trial") {
    lines.push({ text: "Usuários adicionais", included: false, highlighted: false });
  } else {
    lines.push({ text: "1 usuário (proprietário)", included: true, highlighted: false });
  }
  if (plan.support_enabled) {
    lines.push({ text: "Suporte por e-mail", included: true, highlighted: false });
  } else if (plan.kind === "trial") {
    lines.push({ text: "Suporte por e-mail", included: false, highlighted: false });
  }
  return [...manual, ...lines];
}

function ctaOf(plan: PublicPlan): { label: string; href: string | null; external: boolean } {
  if (plan.kind === "custom") {
    const href = plan.contact_url;
    return { label: plan.cta_label ?? "Entre em contato", href, external: Boolean(href && !href.startsWith("/")) };
  }
  if (plan.kind === "trial") return { label: plan.cta_label ?? "Começar teste grátis", href: "/register", external: false };
  return { label: plan.cta_label ?? "Assinar", href: "/register", external: false };
}

/** Converte a linha do catálogo público (get_public_plans) no modelo de exibição. Nenhum campo administrativo passa por aqui. */
export function toPricingView(plan: PublicPlan): PricingView {
  const cta = ctaOf(plan);
  const priceLabel =
    plan.price === null ? "Sob consulta" : plan.price === 0 ? "R$ 0" : formatPlanPrice(Number(plan.price));
  return {
    id: plan.id,
    code: plan.code,
    kind: plan.kind,
    name: plan.name,
    tagline: plan.tagline,
    highlight: plan.highlight,
    priceLabel,
    periodLabel: plan.kind === "custom" ? null : periodLabelOf(plan.access_duration_days),
    comparePriceLabel: plan.compare_price !== null ? formatPlanPrice(Number(plan.compare_price)) : null,
    discountLabel: plan.discount_percent !== null ? formatDiscountLabel(Number(plan.discount_percent)) : null,
    savingsLabel: plan.savings_amount !== null ? `Você economiza ${formatPlanPrice(Number(plan.savings_amount))}` : null,
    promoEndsAt: plan.promo_ends_at,
    description: plan.description,
    benefitsTitle: plan.benefits_title,
    lines: buildPricingLines(plan),
    ctaLabel: cta.label,
    ctaHref: cta.href,
    ctaExternal: cta.external,
    sortOrder: plan.sort_order,
  };
}

/** Fatos usados pelas perguntas frequentes da home — vêm dos planos reais, nunca de texto fixo. */
export function faqFacts(plans: PublicPlan[]): { trialLabel: string | null; extraUsers: number } {
  const trial = plans.find((p) => p.kind === "trial");
  const paid = plans.find((p) => p.kind === "standard");
  return { trialLabel: trial ? periodLabelOf(trial.access_duration_days) : null, extraUsers: paid?.additional_user_limit ?? 0 };
}
