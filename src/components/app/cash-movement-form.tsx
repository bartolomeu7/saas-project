"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { createCashMovementAction } from "@/lib/cash-register/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import type { SalePaymentMethod } from "@/types/sale";
import type { CashMovementDirection } from "@/types/cash-register";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};

const METHODS = Object.keys(SALE_PAYMENT_METHOD_LABELS) as SalePaymentMethod[];

/**
 * Lançamento manual (sangria, suprimento, despesa avulsa) — só renderizada
 * pela página quando o papel do usuário permite (owner/admin) e há caixa
 * aberto. A proteção real continua em create_cash_movement (RPC); esconder
 * o formulário aqui é só para não oferecer uma ação que sempre falharia.
 */
export function CashMovementForm() {
  const [state, formAction] = useFormState(createCashMovementAction, initialState);
  const [direction, setDirection] = useState<CashMovementDirection>("in");
  const formRef = useRef<HTMLFormElement>(null);

  // Sem isso, valor/descrição da última movimentação ficariam parados no
  // formulário depois de um envio bem-sucedido — um segundo lançamento
  // logo em seguida poderia reenviar (ou concatenar, se o campo não for
  // selecionado antes de digitar) texto/valor da vez anterior.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setDirection("in");
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />

      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <div className="flex gap-2">
          <input type="hidden" name="direction" value={direction} />
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              direction === "in"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:bg-secondary"
            )}
          >
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              direction === "out"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:bg-secondary"
            )}
          >
            Saída
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Valor</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="method">Forma</Label>
          <select
            id="method"
            name="method"
            defaultValue="cash"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {SALE_PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          name="description"
          maxLength={200}
          placeholder="Ex: sangria, suprimento, pagamento de fornecedor..."
          required
        />
      </div>

      <SubmitButton pendingLabel="Registrando..." className="w-full sm:w-fit">
        Registrar movimentação
      </SubmitButton>
    </form>
  );
}
