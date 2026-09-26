"use client";

import { useFormState } from "react-dom";
import { addSalePaymentAction } from "@/lib/sales/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: ActionResult = {};

const METHODS = Object.keys(SALE_PAYMENT_METHOD_LABELS) as (keyof typeof SALE_PAYMENT_METHOD_LABELS)[];

export function SalePaymentForm({ saleId }: { saleId: string }) {
  const action = addSalePaymentAction.bind(null, saleId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="method">Forma de pagamento</Label>
          <NativeSelect
            id="method"
            name="method"
            defaultValue="pix"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {SALE_PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Valor</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Observação (opcional)</Label>
          <Input id="notes" name="notes" maxLength={200} />
        </div>
      </div>
      <SubmitButton state={state} pendingLabel="Registrando..." className="w-full sm:w-fit">
        Registrar pagamento
      </SubmitButton>
    </form>
  );
}
