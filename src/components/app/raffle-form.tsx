"use client";

import { useFormState } from "react-dom";
import { runRaffleAction } from "@/lib/raffles/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

export function RaffleForm({ hasAnySales }: { hasAnySales: boolean }) {
  const [state, formAction] = useFormState(runRaffleAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6"
    >
      <FormMessage state={state} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome do sorteio (opcional)</Label>
        <Input id="name" name="name" placeholder="Ex: Sorteio de aniversário" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="registeredFrom">
            Clientes cadastrados a partir de (opcional)
          </Label>
          <Input id="registeredFrom" name="registeredFrom" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="registeredTo">até (opcional)</Label>
          <Input id="registeredTo" name="registeredTo" type="date" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="activeOnly"
          name="activeOnly"
          defaultChecked
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="activeOnly" className="font-normal">
          Somente clientes ativos
        </Label>
      </div>

      <div
        className={
          hasAnySales
            ? "flex flex-col gap-4 rounded-md border border-border p-3"
            : "flex flex-col gap-3 rounded-md border border-dashed border-border p-3 opacity-60"
        }
      >
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Filtros por compras (opcional)
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchasedFrom">Compraram a partir de</Label>
            <Input id="purchasedFrom" name="purchasedFrom" type="date" disabled={!hasAnySales} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchasedTo">até</Label>
            <Input id="purchasedTo" name="purchasedTo" type="date" disabled={!hasAnySales} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="minPurchases">Quantidade mínima de compras</Label>
            <Input
              id="minPurchases"
              name="minPurchases"
              type="number"
              min={1}
              placeholder="Ex: 2"
              disabled={!hasAnySales}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="minAmountSpent">Valor mínimo gasto</Label>
            <Input
              id="minAmountSpent"
              name="minAmountSpent"
              type="number"
              min={0}
              step="0.01"
              placeholder="R$ 0,00"
              disabled={!hasAnySales}
            />
          </div>
        </div>

        {!hasAnySales && (
          <p className="text-xs text-muted-foreground">
            Esses filtros ficam disponíveis assim que houver vendas concluídas vinculadas a clientes.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:w-52">
        <Label htmlFor="winnerCount">Quantidade de vencedores</Label>
        <Input
          id="winnerCount"
          name="winnerCount"
          type="number"
          min={1}
          max={50}
          defaultValue={1}
          required
        />
      </div>

      <SubmitButton pendingLabel="Sorteando..." className="w-full sm:w-fit">
        Sortear cliente
      </SubmitButton>
    </form>
  );
}
