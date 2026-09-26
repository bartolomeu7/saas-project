"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { PurchaseOrderDetail } from "@/lib/purchases/queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

export function PurchaseReceiveForm({
  action,
  order,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  order: PurchaseOrderDetail;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const receivableItems = order.purchase_order_items.filter(
    (item) => item.received_quantity < item.quantity
  );

  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      receivableItems.map((item) => [
        item.id,
        String(item.quantity - item.received_quantity),
      ])
    )
  );

  const payload = JSON.stringify(
    receivableItems
      .map((item) => ({
        purchase_order_item_id: item.id,
        quantity: Number((quantities[item.id] ?? "0").replace(",", ".")),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)
  );

  if (!receivableItems.length) return null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="items" value={payload} />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-left">
              <th className="p-3">Produto</th>
              <th className="p-3">Pedido</th>
              <th className="p-3">Recebido</th>
              <th className="p-3">Saldo</th>
              <th className="p-3">Receber agora</th>
            </tr>
          </thead>
          <tbody>
            {receivableItems.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{item.description}</td>
                <td className="p-3">{item.quantity}</td>
                <td className="p-3">{item.received_quantity}</td>
                <td className="p-3">{item.quantity - item.received_quantity}</td>
                <td className="p-3">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={quantities[item.id] ?? "0"}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="receiveNotes">Observações do recebimento</Label>
        <textarea
          id="receiveNotes"
          name="notes"
          rows={3}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <SubmitButton state={state}
        pendingLabel="Registrando recebimento..."
        className="w-full sm:w-fit"
      >
        Confirmar recebimento
      </SubmitButton>
    </form>
  );
}