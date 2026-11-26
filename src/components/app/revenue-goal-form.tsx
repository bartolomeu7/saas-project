"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import { setRevenueGoalAction } from "@/lib/reports/goal-actions";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};

export function RevenueGoalForm({ target }: { target: number | null }) {
  const [state, formAction] = useFormState(setRevenueGoalAction, initialState);
  const keepInput = useKeepInputOnError(state);
  const current = target === null ? "" : target.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-2 print:hidden">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Meta de faturamento por mês (R$)
          {/* a chave refaz só o campo quando a meta salva muda: a mensagem de "salva" continua na tela */}
          <input key={current} name="target" inputMode="decimal" defaultValue={current} placeholder="Ex.: 5.000,00" maxLength={20} className="h-10 w-48 rounded-md border border-input bg-background px-3 text-sm text-foreground" />
        </label>
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
          Salvar meta
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">Vale deste mês em diante, até você trocar. Deixe vazio para remover.</p>
    </form>
  );
}
