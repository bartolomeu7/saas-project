"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Plan, PublicPlan } from "@/types/billing";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function PlanCard({
  plan,
  isCurrent,
  highlighted,
}: {
  plan: Plan | PublicPlan;
  isCurrent?: boolean;
  highlighted?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = plan.code === "CUSTOM" || plan.price == null;

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
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-6 shadow-soft",
        highlighted ? "border-primary bg-primary/5" : "border-border bg-card"
      )}
    >
      <div>
        <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
        {plan.description && (
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
        )}
      </div>

      <div>
        {isCustom ? (
          <p className="text-2xl font-semibold tracking-tight text-foreground">Sob consulta</p>
        ) : (
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {CURRENCY_FORMATTER.format(Number(plan.price))}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {plan.access_duration_days} dias
            </span>
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>
          {plan.additional_user_limit > 0
            ? `Proprietário + até ${plan.additional_user_limit} usuários`
            : "1 usuário (proprietário)"}
        </li>
        {plan.support_enabled && <li>Suporte por e-mail</li>}
      </ul>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {isCurrent ? (
        <Button variant="outline" disabled>
          Plano atual
        </Button>
      ) : isCustom ? (
        <a
          href="mailto:suporte@primeges.com.br"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Falar com o suporte
        </a>
      ) : (
        <Button onClick={handleSubscribe} disabled={loading}>
          {loading ? "Gerando Pix..." : "Assinar com Pix"}
        </Button>
      )}
    </div>
  );
}
