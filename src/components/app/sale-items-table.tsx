"use client";

import { useState, useTransition } from "react";
import { updateSaleItemAction, removeSaleItemAction } from "@/lib/sales/actions";
import { Input } from "@/components/ui/input";
import type { SaleItem } from "@/types/sale";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

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
      <Table className="w-full min-w-[640px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Item</TableHead>
            <TableHead className="px-4 py-3 font-medium">Quantidade</TableHead>
            <TableHead className="px-4 py-3 font-medium">Preço unit.</TableHead>
            <TableHead className="px-4 py-3 font-medium">Desconto</TableHead>
            <TableHead className="px-4 py-3 font-medium">Total</TableHead>
            {editable && <TableHead className="px-4 py-3 font-medium">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) =>
            editable ? (
              <EditableSaleItemRow key={item.id} saleId={saleId} item={item} />
            ) : (
              <ReadOnlySaleItemRow key={item.id} item={item} />
            )
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReadOnlySaleItemRow({ item }: { item: SaleItem }) {
  return (
    <TableRow>
      <TableCell className="px-4 py-3 text-foreground">{item.description}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{item.quantity}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{formatMoney(item.unit_price)}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{formatMoney(item.discount_amount)}</TableCell>
      <TableCell className="px-4 py-3 text-foreground">{formatMoney(item.total_amount)}</TableCell>
    </TableRow>
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
    setError(null);
    startRemoving(async () => {
      const result = await removeSaleItemAction(saleId, item.id);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="px-4 py-3 text-foreground">
        {item.description}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell className="px-4 py-3">
        <Input
          type="number"
          step="0.001"
          min="0.001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="h-8 w-24"
        />
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{formatMoney(item.unit_price)}</TableCell>
      <TableCell className="px-4 py-3">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
          className="h-8 w-24"
        />
      </TableCell>
      <TableCell className="px-4 py-3 text-foreground">{formatMoney(item.total_amount)}</TableCell>
      <TableCell className="px-4 py-3">
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
          <ConfirmDialog
            title={`Remover "${item.description}" da venda?`}
            confirmLabel="Remover"
            destructive
            onConfirm={handleRemove}
            trigger={
              <button
                type="button"
                disabled={isRemoving}
                className="text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
              >
                Remover
              </button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
