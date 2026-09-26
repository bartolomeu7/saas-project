"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import {
  createCostCenterAction,
  createFinancialCategoryAction,
  createFinancialEntryAction,
  payAccountsPayableAction,
  receiveSalePaymentAction,
} from "@/lib/finance/actions";
import type { CostCenter, FinancialCategory } from "@/types/finance";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";

const initialState: ActionResult = {};

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  other: "Outro",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AccountsPayablePaymentForm({
  payableId,
  balance,
}: {
  payableId: string;
  balance: number;
}) {
  const [state, formAction] = useFormState(payAccountsPayableAction, initialState);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[120px_130px_110px_auto]">
      <input type="hidden" name="payableId" value={payableId} />
      <input
        name="amount"
        defaultValue={balance.toFixed(2)}
        inputMode="decimal"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        aria-label="Valor do pagamento"
      />
      <select
        name="method"
        defaultValue="pix"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        aria-label="Forma de pagamento"
      >
        {Object.entries(paymentLabels).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <input
        name="paymentDate"
        type="date"
        defaultValue={today()}
        className="h-9 rounded-md border bg-background px-2 text-sm"
        aria-label="Data do pagamento"
      />
      <SubmitButton state={state} pendingLabel="Baixando..." className="w-auto">
        Baixar
      </SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function SalePaymentForm({
  saleId,
  balance,
}: {
  saleId: string;
  balance: number;
}) {
  const [state, formAction] = useFormState(receiveSalePaymentAction, initialState);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[120px_120px_auto]">
      <input type="hidden" name="saleId" value={saleId} />
      <input
        name="amount"
        defaultValue={balance.toFixed(2)}
        inputMode="decimal"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        aria-label="Valor recebido"
      />
      <select
        name="method"
        defaultValue="pix"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        aria-label="Forma de recebimento"
      >
        {Object.entries(paymentLabels).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <SubmitButton state={state} pendingLabel="Recebendo..." className="w-auto">
        Receber
      </SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function FinancialEntryForm({
  categories,
  costCenters,
}: {
  categories: FinancialCategory[];
  costCenters: CostCenter[];
}) {
  const [state, formAction] = useFormState(createFinancialEntryAction, initialState);
  const [direction, setDirection] = useState<"income" | "expense">("expense");

  const availableCategories = categories.filter((category) => category.kind === direction);

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Tipo
          <select
            name="direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value as "income" | "expense")}
            className="h-10 rounded-md border bg-background px-3"
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Valor
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="0,00"
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        Descrição
        <input
          name="description"
          required
          placeholder="Ex.: energia elétrica"
          className="h-10 rounded-md border bg-background px-3"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Data
          <input
            name="occurredOn"
            type="date"
            defaultValue={today()}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Forma
          <select name="method" defaultValue="pix" className="h-10 rounded-md border bg-background px-3">
            {Object.entries(paymentLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Categoria
          <select name="categoryId" className="h-10 rounded-md border bg-background px-3">
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        Centro de custo
        <select name="costCenterId" className="h-10 rounded-md border bg-background px-3">
          {costCenters.map((center) => (
            <option key={center.id} value={center.id}>{center.name}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        Observação
        <textarea name="notes" rows={3} className="rounded-md border bg-background px-3 py-2" />
      </label>

      <SubmitButton state={state} pendingLabel="Registrando..." className="w-full sm:w-fit">
        Registrar lançamento
      </SubmitButton>
    </form>
  );
}

export function FinancialCategoryForm() {
  const [state, formAction] = useFormState(createFinancialCategoryAction, initialState);

  return (
    <form action={formAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
      <input
        name="name"
        placeholder="Nova categoria"
        className="h-10 rounded-md border bg-background px-3"
        required
      />
      <select name="kind" defaultValue="expense" className="h-10 rounded-md border bg-background px-3">
        <option value="expense">Despesa</option>
        <option value="income">Receita</option>
      </select>
      <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
        Adicionar
      </SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function CostCenterForm() {
  const [state, formAction] = useFormState(createCostCenterAction, initialState);

  return (
    <form action={formAction} className="mt-5 grid gap-2 sm:flex">
      <input
        name="name"
        placeholder="Novo centro de custo"
        className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3"
        required
      />
      <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
        Adicionar
      </SubmitButton>
      <div className="sm:min-w-40"><FormMessage state={state} /></div>
    </form>
  );
}
