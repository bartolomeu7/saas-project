import Link from "next/link";
import { Check, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPlanPrice, type PricingPlan } from "@/config/marketing";

export function PricingCard({ plan }: { plan: PricingPlan }) {
  const highlightStyles =
    plan.highlight === "popular"
      ? "border-primary/40 bg-card shadow-card ring-1 ring-primary/20"
      : plan.highlight === "value"
        ? "border-success/40 bg-card shadow-card"
        : "border-border bg-card/60";

  const badgeStyles =
    plan.highlight === "popular"
      ? "bg-primary/15 text-primary"
      : plan.highlight === "value"
        ? "bg-success/15 text-success"
        : "bg-secondary text-muted-foreground";

  return (
    <div className={cn("flex flex-col rounded-xl border p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-card motion-reduce:transform-none", highlightStyles)}>
      {plan.tagline && (
        <span
          className={cn(
            "mb-3 w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
            badgeStyles
          )}
        >
          {plan.tagline}
        </span>
      )}

      <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
        {plan.name}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {plan.price !== null ? formatPlanPrice(plan.price) : "Sob consulta"}
      </p>
      <p className="text-xs text-muted-foreground">{plan.periodLabel} de acesso</p>
      <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {plan.includedFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.25} />
            {feature}
          </li>
        ))}
        {plan.excludedFeatures?.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2.5 text-sm text-muted-foreground/60"
          >
            <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth={2.25} />
            {feature}
          </li>
        ))}
      </ul>

      {plan.ctaHref ? (
        <Link
          href={plan.ctaHref}
          className={cn(
            buttonVariants({ variant: plan.highlight ? "default" : "outline" }),
            "mt-6 w-full"
          )}
        >
          {plan.ctaLabel}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-6 w-full cursor-not-allowed opacity-50"
          )}
        >
          {plan.ctaLabel}
        </span>
      )}
    </div>
  );
}
