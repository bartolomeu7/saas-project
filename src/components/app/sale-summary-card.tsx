"use client";

import { useState, useTransition } from "react";
import { updateDraftSaleAction } from "@/lib/sales/actions";
import { Input } from "@/components/ui/input";
import { calculateMarginPercentage } from "@/types/sale";
import type { Sale } from "@/types/sale";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SaleSummaryCard({ sale, editable }: { sale: Sale; editable: boolean }) {
  const [discount, setDiscount] = useState(String(sale.discount_amount));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const marginPercentage = calculateMarginPercentage(sale.estimated_margin, sale.total_amount);
  const dirty = editable && discount !== String(sale.discount_amount);

  function handleSaveDiscount() {
    setError(null);
    startSaving(async () => {
      const formData = new FormData();
      formData.set("discountAmount", discount || "0");
      const result = await updateDraftSaleAction(sale.id, {}, formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Resumo</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-foreground">{formatMoney(sale.subtotal)}</dd>
        </div>

        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Desconto manual</dt>
          {editable ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                className="h-8 w-28"
              />
              {dirty && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveDiscount}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Salvar
                </button>
              )}
            </div>
          ) : (
            <dd className="text-foreground">{formatMoney(sale.discount_amount)}</dd>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Origem separada de discount_amount desde a Etapa 1D.6A/B — nunca
            somadas numa única linha "Desconto", para nunca dar a entender
            que são a mesma coisa. Só aparece com resgate ativo, para não
            poluir o resumo das vendas sem fidelidade. */}
        {sale.loyalty_discount_amount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Desconto de fidelidade</dt>
            <dd className="text-foreground">{formatMoney(sale.loyalty_discount_amount)}</dd>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
          <dt className="text-foreground">Total</dt>
          <dd className="text-foreground">{formatMoney(sale.total_amount)}</dd>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <dt className="text-muted-foreground">Custo estimado</dt>
          <dd className="text-muted-foreground">{formatMoney(sale.total_cost)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Margem estimada</dt>
          <dd className="text-foreground">
            {formatMoney(sale.estimated_margin)}
            {marginPercentage !== null && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({marginPercentage.toFixed(1)}%)
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
