"use client";

import { useFormState } from "react-dom";
import { completeSaleAction } from "@/lib/sales/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

/**
 * SubmitButton já usa useFormStatus internamente para desabilitar o
 * botão durante o envio — evita duplo clique/duplo envio sem lógica
 * extra. A proteção real contra duplicidade é do banco (complete_sale
 * trava a linha da venda), isto aqui é só UX.
 */
export function CompleteSaleButton({ saleId }: { saleId: string }) {
  const action = completeSaleAction.bind(null, saleId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Concluindo..." className="w-full sm:w-fit">
        Concluir venda
      </SubmitButton>
    </form>
  );
}
