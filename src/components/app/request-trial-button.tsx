"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestFreeTrialAction } from "@/lib/companies/actions";

/**
 * Pede o teste grátis para a empresa que ainda não o recebeu. O servidor aplica a mesma regra do cadastro (conexão,
 * janela, limite) e o banco concede uma única vez; este botão só dispara o pedido e mostra o resultado.
 */
export function RequestTrialButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await requestFreeTrialAction();
            if (result.error) {
              setError(result.error);
              return;
            }
            toast.success(result.success ?? "Teste grátis liberado.");
            router.refresh();
          })
        }
      >
        {pending ? "Verificando..." : "Solicitar teste grátis"}
      </Button>
      {error && (
        <p role="alert" className="max-w-xl text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
