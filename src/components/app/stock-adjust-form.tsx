"use client";

import { useFormState } from "react-dom";
import { adjustStockAction } from "@/lib/products/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

export function StockAdjustForm({
  productId,
  currentStock,
  unit,
}: {
  productId: string;
  currentStock: number;
  unit: string;
}) {
  const action = adjustStockAction.bind(null, productId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-xs text-muted-foreground">
        Estoque atual: {currentStock} {unit}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newQuantity">Novo estoque</Label>
        <Input
          id="newQuantity"
          name="newQuantity"
          type="number"
          step="0.001"
          min="0"
          defaultValue={currentStock}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Motivo do ajuste</Label>
        <Input
          id="reason"
          name="reason"
          placeholder="Ex: contagem de inventário, perda, correção"
          required
        />
      </div>
      <SubmitButton pendingLabel="Ajustando..." className="w-full sm:w-fit">
        Ajustar estoque
      </SubmitButton>
    </form>
  );
}
