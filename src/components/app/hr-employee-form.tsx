"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { HrEmployeeFormFields, HrPayFrequency, HrRateKind } from "@/types/hr";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";
import { FREQUENCY_LABELS, WEEKDAY_NAMES } from "@/lib/hr/schedule";
import { RATE_KIND_LABELS } from "@/lib/hr/labels";

const initialState: ActionResult = {};
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export function HrEmployeeForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<HrEmployeeFormFields>;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const keepInput = useKeepInputOnError(state);
  const [frequency, setFrequency] = useState<HrPayFrequency>(defaultValues?.pay_frequency ?? "weekly");
  const [rateKind, setRateKind] = useState<HrRateKind>(defaultValues?.rate_kind ?? "per_day");
  const value = (key: keyof HrEmployeeFormFields) => defaultValues?.[key] ?? "";

  return (
    <form action={formAction} onReset={keepInput} className="flex flex-col gap-6">
      <FormMessage state={state} />

      <section className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2" aria-labelledby="hr-dados">
        <h2 id="hr-dados" className="text-sm font-semibold sm:col-span-2">Dados do funcionário</h2>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="full_name">Nome completo *</Label>
          <Input id="full_name" name="full_name" defaultValue={value("full_name")} required minLength={3} maxLength={160} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birth_date">Data de nascimento</Label>
          <Input id="birth_date" name="birth_date" type="date" defaultValue={value("birth_date")} min="1900-01-01" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="started_on">Começou a trabalhar em</Label>
          <Input id="started_on" name="started_on" type="date" defaultValue={value("started_on")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role_title">Função</Label>
          <Input id="role_title" name="role_title" defaultValue={value("role_title")} maxLength={80} placeholder="Ex.: Auxiliar, Cabeleireira" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Telefone / WhatsApp</Label>
          <Input id="phone" name="phone" defaultValue={value("phone")} maxLength={40} inputMode="tel" />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="pix_key">Chave Pix para pagamento</Label>
          <Input id="pix_key" name="pix_key" defaultValue={value("pix_key")} maxLength={140} autoComplete="off" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2" aria-labelledby="hr-pagamento">
        <h2 id="hr-pagamento" className="text-sm font-semibold sm:col-span-2">Como e quando você paga</h2>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="rate_kind">Forma de cálculo *</Label>
          <NativeSelect id="rate_kind" name="rate_kind" value={rateKind} onChange={(event) => setRateKind(event.target.value as HrRateKind)} className={selectClass}>
            <option value="per_day">{RATE_KIND_LABELS.per_day}</option>
            <option value="fixed">{RATE_KIND_LABELS.fixed}</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="base_amount">{rateKind === "per_day" ? "Valor da diária (R$) *" : "Valor por período (R$) *"}</Label>
          <Input id="base_amount" name="base_amount" inputMode="decimal" defaultValue={value("base_amount")} placeholder="0,00" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay_frequency">Frequência de pagamento *</Label>
          <NativeSelect id="pay_frequency" name="pay_frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as HrPayFrequency)} className={selectClass}>
            {(Object.keys(FREQUENCY_LABELS) as HrPayFrequency[]).map((key) => (
              <option key={key} value={key}>{FREQUENCY_LABELS[key]}{key === "biweekly" ? " (a cada 15 dias)" : ""}</option>
            ))}
          </NativeSelect>
        </div>
        {frequency === "weekly" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pay_weekday">Dia da semana do pagamento *</Label>
            <NativeSelect id="pay_weekday" name="pay_weekday" defaultValue={value("pay_weekday") || "5"} className={selectClass}>
              {WEEKDAY_NAMES.map((name, index) => (
                <option key={name} value={index}>{name}</option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {frequency === "monthly" || frequency === "biweekly" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pay_day_of_month">{frequency === "biweekly" ? "Primeiro dia de pagamento (1 a 15) *" : "Dia do mês do pagamento *"}</Label>
            <Input
              id="pay_day_of_month"
              name="pay_day_of_month"
              type="number"
              min={1}
              max={frequency === "biweekly" ? 15 : 31}
              defaultValue={value("pay_day_of_month") || (frequency === "biweekly" ? "5" : "5")}
              required
            />
            {frequency === "biweekly" ? <p className="text-xs text-muted-foreground">Paga nesse dia e 15 dias depois (ex.: dias 5 e 20).</p> : null}
          </div>
        ) : null}
        {frequency === "daily" ? (
          <p className="text-xs text-muted-foreground sm:col-span-2">Pagamento diário: você fecha o período do dia e paga no mesmo dia.</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <Label htmlFor="notes">Observações</Label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={value("notes")} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </section>

      <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">{submitLabel}</SubmitButton>
    </form>
  );
}
