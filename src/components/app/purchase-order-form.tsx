"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { Product } from "@/types/product";
import type { Supplier } from "@/types/supplier";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

type DraftItem = { productId: string; quantity: string; unitCost: string };
const initialState: ActionResult = {};

const formatMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PurchaseOrderForm({
  action,
  suppliers,
  products,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  suppliers: Supplier[];
  products: Product[];
}) {
  const [state, formAction] = useFormState(action, initialState);
  const [items, setItems] = useState<DraftItem[]>([
    { productId: "", quantity: "1", unitCost: "" },
  ]);

  const total = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.quantity.replace(",", ".")) || 0;
        const cost = Number(item.unitCost.replace(",", ".")) || 0;
        return sum + qty * cost;
      }, 0),
    [items]
  );

  const payload = JSON.stringify(
    items
      .filter((item) => item.productId)
      .map((item) => ({
        product_id: item.productId,
        quantity: Number(item.quantity.replace(",", ".")),
        unit_cost: Number(item.unitCost.replace(",", ".")),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          Number.isFinite(item.unit_cost) &&
          item.unit_cost >= 0
      )
  );

  function patchItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    patchItem(index, {
      productId,
      unitCost:
        product && Number(product.cost_price) > 0
          ? String(product.cost_price)
          : "",
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <input type="hidden" name="items" value={payload} />

      <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="supplierId">Fornecedor *</Label>
          <select
            id="supplierId"
            name="supplierId"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Selecione...</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expectedAt">Previsão de recebimento</Label>
          <Input id="expectedAt" name="expectedAt" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueDate">Vencimento da conta a pagar</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="notes">Observações</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold">Itens do pedido</h2>
            <p className="text-xs text-muted-foreground">
              O custo é armazenado como snapshot no pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setItems((current) => [
                ...current,
                { productId: "", quantity: "1", unitCost: "" },
              ])
            }
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            + Adicionar item
          </button>
        </div>

        <div className="divide-y">
          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1.5fr_0.6fr_0.8fr_auto] md:items-end"
            >
              <div className="flex flex-col gap-2">
                <Label>Produto</Label>
                <select
                  value={item.productId}
                  onChange={(event) =>
                    selectProduct(index, event.target.value)
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Selecione...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — estoque {product.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={item.quantity}
                  onChange={(event) =>
                    patchItem(index, { quantity: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Custo unitário</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitCost}
                  onChange={(event) =>
                    patchItem(index, { unitCost: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-32 rounded-md border border-dashed p-2 text-right text-sm">
                  {formatMoney(
                    (Number(item.quantity.replace(",", ".")) || 0) *
                      (Number(item.unitCost.replace(",", ".")) || 0)
                  )}
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, i) => i !== index)
                      )
                    }
                    className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end border-t bg-muted/20 p-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total estimado</p>
            <p className="text-2xl font-semibold">{formatMoney(total)}</p>
          </div>
        </div>
      </section>

      <SubmitButton pendingLabel="Criando pedido..." className="w-full sm:w-fit">
        Criar pedido de compra
      </SubmitButton>
    </form>
  );
}