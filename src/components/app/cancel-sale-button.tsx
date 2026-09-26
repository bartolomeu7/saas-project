"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { cancelSaleAction } from "@/lib/sales/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionResult = {};

/**
 * Botão de cancelar venda concluída. Abre um modal (Dialog do shadcn/ui) que
 * pede o motivo antes de confirmar; o estoque de produtos é restaurado pela
 * própria Server Action.
 */
export function CancelSaleButton({ saleId }: { saleId: string }) {
  const action = cancelSaleAction.bind(null, saleId);
  const [state, formAction] = useFormState(action, initialState);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="whitespace-nowrap text-sm font-medium text-destructive underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Cancelar venda
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar venda</DialogTitle>
          <DialogDescription>
            Informe o motivo do cancelamento. O estoque de produtos será restaurado.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`cancel-reason-${saleId}`}>Motivo do cancelamento</Label>
            <Textarea
              id={`cancel-reason-${saleId}`}
              name="reason"
              required
              rows={3}
              placeholder="Ex.: cliente desistiu da compra"
            />
          </div>
          <FormMessage state={state} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <SubmitButton
              state={state}
              pendingLabel="Cancelando..."
              variant="destructive"
              className="w-full sm:w-auto"
              successLabel="Cancelada"
            >
              Confirmar cancelamento
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
