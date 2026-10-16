"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PricingView } from "@/lib/billing/pricing-display";

/**
 * Cartão da tela de planos do app. Mostra o MESMO modelo do site (PricingView, vindo de get_public_plans), inclusive
 * preço anterior/desconto quando a promoção está vigente. O clique em "Assinar" envia só o `planId`: o valor cobrado é
 * sempre lido do plano no servidor/banco (/api/billing/create-payment + claim_subscription_payment) — nenhum preço
 * trafega do navegador.
 */
export function PlanCard({
  plan,
  isCurrent,
  highlighted,
  hiddenFromCatalog = false,
}: {
  plan: PricingView;
  isCurrent?: boolean;
  highlighted?: boolean;
  /** Plano ativo do cliente que não está mais listado no site: continua renovável. */
  hiddenFromCatalog?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = plan.kind === "custom";

  async function handleSubscribe() {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível iniciar o pagamento.");
        setLoading(false);
        return;
      }

      router.push(`/app/assinatura/pagamento/${data.paymentId}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
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

      {error && <p className="text-xs text-destructive">{error}</p>}

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
        <Button onClick={handleSubscribe} disabled={loading}>
          {loading ? "Gerando Pix..." : "Assinar com Pix"}
        </Button>
      )}
    </div>
  );
}
