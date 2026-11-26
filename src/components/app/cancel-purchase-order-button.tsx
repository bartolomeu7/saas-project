"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { cancelPurchaseOrderAction } from "@/lib/purchases/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};

/** Cancelar pedido de compra pede o motivo, que fica no histórico. O sucesso redireciona a página. */
export function CancelPurchaseOrderButton({ orderId }: { orderId: string }) {
  const [state, formAction] = useFormState(cancelPurchaseOrderAction.bind(null, orderId), initialState);
  const keepInput = useKeepInputOnError(state);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">Cancelar pedido</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar este pedido de compra?</DialogTitle>
          <DialogDescription>O pedido será cancelado e não poderá mais receber mercadoria.</DialogDescription>
        </DialogHeader>
        <form action={formAction} onReset={keepInput} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancel-order-reason">Motivo do cancelamento</Label>
            <Textarea id="cancel-order-reason" name="reason" required maxLength={500} rows={3} placeholder="Ex.: fornecedor sem estoque" />
          </div>
          <FormMessage state={state} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Voltar</Button>
            <SubmitButton state={state} pendingLabel="Cancelando..." variant="destructive" className="w-full sm:w-auto">
              Confirmar cancelamento
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
