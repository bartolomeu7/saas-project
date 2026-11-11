"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import { closePayrollBatchAction } from "@/lib/hr/actions";
import { FormMessage } from "@/components/shared/auth/form-message";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";
import { SubmitButton } from "@/components/shared/auth/submit-button";

const initialState: ActionResult = {};

export function BatchPayrollForm({ month, employees }: { month: string; employees: { id: string; name: string; salary: string }[] }) {
  const [state, formAction] = useFormState(closePayrollBatchAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-4">
      <input type="hidden" name="month" value={month} />
      <ul className="divide-y rounded-lg border">
        {employees.map((employee) => (
          <li key={employee.id}>
            <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-3">
                <input type="checkbox" name="employeeId" value={employee.id} defaultChecked className="h-4 w-4" />
                {employee.name}
              </span>
              <span className="text-muted-foreground">{employee.salary}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Fecha a folha sem horas extras, faltas nem dias de férias. Quem tem variações no mês fecha pela ficha do funcionário. Você paga depois, em cada pagamento.
      </p>
      <SubmitButton state={state} pendingLabel="Fechando..." className="w-fit">Fechar folhas marcadas</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
