"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { cancelSaleAction } from "@/lib/sales/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

/**
 * Botão de cancelar venda concluída. Pede o motivo antes de confirmar —
 * sem modal dedicado no design system ainda, usa window.prompt (mesmo
 * espírito minimalista do window.confirm já usado em desativar
 * produto/serviço/cliente).
 */
export function CancelSaleButton({ saleId }: { saleId: string }) {
  const action = cancelSaleAction.bind(null, saleId);
  const [state, formAction] = useFormState(action, initialState);
  const [reason, setReason] = useState<string | null>(null);

  function handleClick() {
    const value = window.prompt(
      "Motivo do cancelamento (o estoque de produtos será restaurado):"
    );
    if (value && value.trim()) {
      setReason(value.trim());
    }
  }

  if (reason === null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        Cancelar venda
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="reason" value={reason} />
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Motivo: {reason}</span>
        <SubmitButton
          pendingLabel="Cancelando..."
          variant="outline"
          size="sm"
          className="w-fit text-destructive"
        >
          Confirmar cancelamento
        </SubmitButton>
        <button
          type="button"
          onClick={() => setReason(null)}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Desistir
        </button>
      </div>
    </form>
  );
}
