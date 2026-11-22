"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PricingView } from "@/lib/billing/pricing-display";

/**
 * Cartão da tela de planos do app. Mostra o MESMO modelo do site (PricingView, vindo de get_public_plans), inclusive
 * preço anterior/desconto quando a promoção está vigente. O clique em "Assinar" abre o checkout só com o `planId`: o valor
 * cobrado é sempre lido do plano no servidor/banco (/api/billing/create-payment + claim_gateway_payment) — nenhum preço
 * trafega do navegador.
 */
export function PlanCard({
  plan,
  isCurrent,
  highlighted,
  hiddenFromCatalog = false,
  cardEnabled = false,
}: {
  plan: PricingView;
  isCurrent?: boolean;
  highlighted?: boolean;
  /** Plano ativo do cliente que não está mais listado no site: continua renovável. */
  hiddenFromCatalog?: boolean;
  /** Mostra também o botão de pagamento por cartão (só quando a SyncPay está configurada para cartão). */
  cardEnabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"pix" | "card" | null>(null);

  const isCustom = plan.kind === "custom";

  /** "Assinar" leva ao checkout: resumo do plano, dados que faltarem no cadastro e só então a cobrança. */
  function handleSubscribe(method: "pix" | "card") {
    setLoading(method);
    router.push(`/app/assinatura/checkout/${plan.id}?method=${method}`);
  }

  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border p-6 shadow-soft", highlighted ? "border-primary bg-primary/5" : "border-border bg-card")}>
      <div>
        {plan.tagline && <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-primary">{plan.tagline}</p>}
        <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
        {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
        {hiddenFromCatalog && <p className="mt-1 text-xs text-muted-foreground">Plano atual (não listado para novos clientes).</p>}
      </div>

      <div>
        {plan.comparePriceLabel && (
          <p className="text-sm text-muted-foreground">
            <span className="sr-only">Preço anterior: </span>
            <s>{plan.comparePriceLabel}</s>
          </p>
        )}
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {plan.priceLabel}
          {!isCustom && plan.periodLabel && <span className="text-sm font-normal text-muted-foreground"> / {plan.periodLabel}</span>}
        </p>
        {plan.discountLabel && <p className="mt-1 text-xs font-semibold text-success">{plan.discountLabel}</p>}
      </div>

      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {plan.lines.map((line, index) => (
          <li key={`${index}-${line.text}`} className={cn(!line.included && "line-through opacity-70", line.highlighted && "font-semibold text-foreground")}>
            {line.text}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <Button variant="outline" disabled>
          Plano atual
        </Button>
      ) : isCustom ? (
        <a
          href={plan.ctaHref ?? "mailto:suporte@primeges.com.br"}
          {...(plan.ctaExternal || !plan.ctaHref ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          {plan.ctaHref ? plan.ctaLabel : "Falar com o suporte"}
        </a>
      ) : (
        <div className="flex flex-col gap-2">
          <Button onClick={() => handleSubscribe("pix")} disabled={loading !== null}>
            {loading === "pix" ? "Abrindo..." : "Assinar com Pix"}
          </Button>
          {cardEnabled && (
            <Button variant="outline" onClick={() => handleSubscribe("card")} disabled={loading !== null}>
              {loading === "card" ? "Abrindo..." : "Pagar com cartão"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
