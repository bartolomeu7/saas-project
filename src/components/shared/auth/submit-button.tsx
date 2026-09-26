"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/auth/actions";

interface SubmitButtonProps extends ButtonProps {
  pendingLabel?: string;
  /** Rótulo mostrado por ~2s depois de uma gravação bem-sucedida (`state.success`). */
  successLabel?: string;
  /**
   * Estado devolvido pela Server Action (useFormState). Quando traz
   * `success`, o botão faz a transição Enviando… → ✓ Salvo. Erros nunca
   * são mascarados: em caso de `error` o botão volta ao rótulo normal e a
   * mensagem aparece no FormMessage/toast.
   */
  state?: ActionResult;
}

/**
 * Botão de envio dos formulários (shadcn/ui Button + useFormStatus).
 * Estados: repouso → pendente (spinner) → sucesso (✓, por 2s).
 */
export function SubmitButton({
  children,
  pendingLabel = "Enviando...",
  successLabel = "Salvo",
  state,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!state?.success) return;
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const success = showSuccess && !pending;

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full"
      {...props}
      aria-live="polite"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : success ? (
        <>
          <Check aria-hidden="true" />
          {successLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
