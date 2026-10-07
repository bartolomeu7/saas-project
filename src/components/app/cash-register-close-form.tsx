"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { closeCashRegisterAction } from "@/lib/cash-register/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A diferença mostrada aqui é só uma prévia (client-side, recalculada a
 * cada tecla) — o valor que realmente é gravado (expected_cash_balance,
 * informed_cash_balance, cash_difference) é sempre recalculado dentro de
 * close_cash_register no momento do envio, nunca confiado a partir deste
 * componente. Sem tolerância automática: qualquer diferença, mesmo
 * pequena, é sempre exibida e sempre registrada.
 */
export function CashRegisterCloseForm({
  cashRegisterId,
  expectedCashBalance,
}: {
  cashRegisterId: string;
  expectedCashBalance: number;
}) {
  const action = closeCashRegisterAction.bind(null, cashRegisterId);
  const [state, formAction] = useFormState(action, initialState);
  const [informedRaw, setInformedRaw] = useState("");

  const difference = useMemo(() => {
    const informed = Number(informedRaw.replace(",", "."));
    if (!Number.isFinite(informed) || informedRaw.trim() === "") return null;
    return informed - expectedCashBalance;
  }, [informedRaw, expectedCashBalance]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Saldo esperado em espécie</Label>
          <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-sm font-medium">
            {formatMoney(expectedCashBalance)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="informedCashBalance">Saldo em espécie contado</Label>
          <Input
            id="informedCashBalance"
            name="informedCashBalance"
            type="number"
            step="0.01"
            min="0"
            required
            value={informedRaw}
            onChange={(event) => setInformedRaw(event.target.value)}
          />
        </div>
      </div>

      {difference !== null && (
        <div
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (difference === 0
              ? "border-border text-muted-foreground"
              : difference > 0
                ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "border-destructive/30 bg-destructive/10 text-destructive")
          }
        >
          Diferença: {formatMoney(difference)}
          {difference === 0 && " (sem diferença)"}
          {difference > 0 && " (sobra)"}
          {difference < 0 && " (falta)"}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Observação (opcional)</Label>
        <Input id="notes" name="notes" maxLength={200} />
      </div>

      <SubmitButton state={state} pendingLabel="Fechando..." className="w-full sm:w-fit">
        Fechar caixa
      </SubmitButton>
    </form>
  );
}
