import Link from "next/link";
import { Check, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PricingView } from "@/lib/billing/pricing-display";

/**
 * Cartão de plano do site público. Recebe só o modelo de EXIBIÇÃO (PricingView), montado a partir do catálogo público
 * do banco (get_public_plans). Preço anterior riscado e percentual só aparecem quando o banco os entrega (promoção
 * vigente e válida). Todo texto vira texto do React (escapado): nada de HTML vindo do cadastro é interpretado.
 */
export function PricingCard({ plan, preview = false }: { plan: PricingView; preview?: boolean }) {
  const highlightStyles =
    plan.highlight === "popular"
      ? "border-primary/40 bg-card shadow-card ring-1 ring-primary/20"
      : plan.highlight === "value"
        ? "border-success/40 bg-card shadow-card"
        : "border-border bg-card/60";

  const badgeStyles =
    plan.highlight === "popular"
      ? "bg-primary/15 text-[hsl(207_100%_72%)]"
      : plan.highlight === "value"
        ? "bg-success/15 text-success"
        : "bg-secondary text-muted-foreground";

  const ctaClass = cn(buttonVariants({ variant: plan.highlight ? "default" : "outline" }), "mt-6 w-full");

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-card motion-reduce:transform-none",
        highlightStyles
      )}
    >
      {plan.tagline && (
        <span className={cn("mb-3 w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide", badgeStyles)}>
          {plan.tagline}
        </span>
      )}

      <p className="text-sm font-semibold uppercase tracking-wide text-foreground">{plan.name}</p>

      {plan.comparePriceLabel && (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="sr-only">Preço anterior: </span>
          <s>{plan.comparePriceLabel}</s>
        </p>
      )}
      <p className={cn("text-3xl font-semibold tracking-tight text-foreground", plan.comparePriceLabel ? "mt-0.5" : "mt-2")}>{plan.priceLabel}</p>
      {plan.discountLabel && (
        <p className="mt-1">
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">{plan.discountLabel}</span>
        </p>
      )}
      {plan.periodLabel && <p className="mt-1 text-xs text-muted-foreground">{plan.periodLabel} de acesso</p>}
      {plan.description && <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>}

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {plan.lines.map((line, index) => (
          <li
            key={`${index}-${line.text}`}
            className={cn("flex items-start gap-2.5 text-sm", line.included ? "text-foreground" : "text-muted-foreground/90", line.highlighted && "font-semibold")}
          >
            {line.included ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.25} aria-label="Incluído" />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth={2.25} aria-label="Não incluído" />
            )}
            {line.text}
          </li>
        ))}
      </ul>

      {preview || !plan.ctaHref ? (
        <span aria-disabled="true" className={cn(ctaClass, "cursor-not-allowed opacity-50")}>
          {plan.ctaLabel}
        </span>
      ) : plan.ctaExternal ? (
        <a href={plan.ctaHref} target="_blank" rel="noopener noreferrer" className={ctaClass}>
          {plan.ctaLabel}
        </a>
      ) : (
        <Link href={plan.ctaHref} className={ctaClass}>
          {plan.ctaLabel}
        </Link>
      )}
    </div>
  );
}
