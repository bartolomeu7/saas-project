"use client";

import { useFormState } from "react-dom";
import { openCashRegisterAction } from "@/lib/cash-register/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

export function CashRegisterOpenForm() {
  const [state, formAction] = useFormState(openCashRegisterAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openingBalance">Saldo inicial</Label>
          <Input
            id="openingBalance"
            name="openingBalance"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Observação (opcional)</Label>
          <Input id="notes" name="notes" maxLength={200} />
        </div>
      </div>
      <SubmitButton pendingLabel="Abrindo..." className="w-full sm:w-fit">
        Abrir caixa
      </SubmitButton>
    </form>
  );
}
