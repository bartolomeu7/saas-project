"use client";

import { useState, useTransition } from "react";
import { updateSaleItemAction, removeSaleItemAction } from "@/lib/sales/actions";
import { Input } from "@/components/ui/input";
import type { SaleItem } from "@/types/sale";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SaleItemsTable({
  saleId,
  items,
  editable,
}: {
  saleId: string;
  items: SaleItem[];
  editable: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nenhum item adicionado ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 font-medium">Quantidade</th>
            <th className="px-4 py-3 font-medium">Preço unit.</th>
            <th className="px-4 py-3 font-medium">Desconto</th>
            <th className="px-4 py-3 font-medium">Total</th>
            {editable && <th className="px-4 py-3 font-medium">Ações</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) =>
            editable ? (
              <EditableSaleItemRow key={item.id} saleId={saleId} item={item} />
            ) : (
              <ReadOnlySaleItemRow key={item.id} item={item} />
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlySaleItemRow({ item }: { item: SaleItem }) {
  return (
    <tr>
      <td className="px-4 py-3 text-foreground">{item.description}</td>
      <td className="px-4 py-3 text-muted-foreground">{item.quantity}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatMoney(item.unit_price)}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatMoney(item.discount_amount)}</td>
      <td className="px-4 py-3 text-foreground">{formatMoney(item.total_amount)}</td>
    </tr>
  );
}

function EditableSaleItemRow({ saleId, item }: { saleId: string; item: SaleItem }) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [discount, setDiscount] = useState(String(item.discount_amount));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isRemoving, startRemoving] = useTransition();

  const dirty = quantity !== String(item.quantity) || discount !== String(item.discount_amount);

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const formData = new FormData();
      formData.set("quantity", quantity);
      formData.set("discountAmount", discount || "0");
      const result = await updateSaleItemAction(saleId, item.id, {}, formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function handleRemove() {
    if (!window.confirm(`Remover "${item.description}" da venda?`)) return;
    startRemoving(() => removeSaleItemAction(saleId, item.id));
  }

  return (
    <tr>
      <td className="px-4 py-3 text-foreground">
        {item.description}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          step="0.001"
          min="0.001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="h-8 w-24"
        />
      </td>
      <td className="px-4 py-3 text-muted-foreground">{formatMoney(item.unit_price)}</td>
      <td className="px-4 py-3">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
          className="h-8 w-24"
        />
      </td>
      <td className="px-4 py-3 text-foreground">{formatMoney(item.total_amount)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {dirty && (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Salvar
            </button>
          )}
          <button
            type="button"
            disabled={isRemoving}
            onClick={handleRemove}
            className="text-xs font-medium text-destructive underline-offset-4 hover:underline"
          >
            Remover
          </button>
        </div>
      </td>
    </tr>
  );
}
