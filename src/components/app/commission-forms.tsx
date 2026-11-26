"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import { setCommissionRateAction, setItemProfessionalAction } from "@/lib/reports/commission-actions";
import { MIN_RATE_DATE } from "@/lib/reports/commission";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { NativeSelect } from "@/components/ui/native-select";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};
const input = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

export function CommissionRateForm({ professionalId, name, percent, from }: { professionalId: string; name: string; percent: number | null; from: string }) {
  const [state, formAction] = useFormState(setCommissionRateAction, initialState);
  const keepInput = useKeepInputOnError(state);
  const current = percent === null ? "" : percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-1.5">
      <input type="hidden" name="professionalId" value={professionalId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Comissão (%)
          <input key={current} name="percent" inputMode="decimal" required defaultValue={current} maxLength={7} aria-label={`Comissão de ${name} em %`} className={input + " w-24"} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          A partir de
          <input name="from" type="date" required min={MIN_RATE_DATE} defaultValue={from} className={input + " w-40"} />
        </label>
        <SubmitButton state={state} pendingLabel="Salvando..." size="sm" className="w-auto">
          Salvar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ItemProfessionalForm({
  itemId,
  value,
  emptyLabel,
  team,
  description,
}: {
  itemId: string;
  /** Profissional escolhido no relatório; "" quando vale a agenda (ou ninguém). */
  value: string;
  emptyLabel: string;
  team: Array<{ id: string; name: string }>;
  description: string;
}) {
  const [state, formAction] = useFormState(setItemProfessionalAction, initialState);
  const keepInput = useKeepInputOnError(state);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-1.5">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex items-center gap-2">
        <NativeSelect key={value} name="professionalId" defaultValue={value} aria-label={`Quem fez ${description}`} className="h-9 w-44 text-sm">
          <option value="">{emptyLabel}</option>
          {team.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </NativeSelect>
        <SubmitButton state={state} pendingLabel="..." size="sm" className="w-auto">
          Salvar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
