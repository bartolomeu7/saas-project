"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import {
  addAdjustmentAction,
  cancelPaymentAction,
  closePayrollAction,
  closePeriodAction,
  deleteAdjustmentAction,
  payPaymentAction,
  saveHrSettingsAction,
  setAttendanceAction,
} from "@/lib/hr/actions";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export interface AttendanceDay {
  date: string;
  /** "seg 03" */
  label: string;
  quantity: number | null;
  locked: boolean;
  future: boolean;
  weekend: boolean;
}

const CHOICES: { value: string; label: string; quantity: number }[] = [
  { value: "1", label: "Inteiro", quantity: 1 },
  { value: "0.5", label: "Meio", quantity: 0.5 },
  { value: "0", label: "Falta", quantity: 0 },
];

/** Lista os dias do mês com 3 botões por dia (inteiro, meio dia, falta); clicar de novo no marcado apaga. */
export function AttendanceDays({ employeeId, days }: { employeeId: string; days: AttendanceDay[] }) {
  const [state, formAction] = useFormState(setAttendanceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <ul className="divide-y rounded-lg border" aria-label="Presença por dia">
        {days.map((day) => (
          <li key={day.date} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2", day.weekend && "bg-muted/30")}>
            <span className={cn("w-20 text-sm", day.future && "text-muted-foreground")}>{day.label}</span>
            {day.locked ? (
              <span className="text-xs text-muted-foreground">
                {day.quantity === 1 ? "Inteiro" : day.quantity === 0.5 ? "Meio dia" : "Falta"} · já pago
              </span>
            ) : day.future ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <span className="flex gap-1" role="group" aria-label={`Presença em ${day.label}`}>
                {CHOICES.map((choice) => {
                  const active = day.quantity === choice.quantity;
                  return (
                    <button
                      key={choice.value}
                      type="submit"
                      name="pick"
                      value={`${day.date}|${active ? "clear" : choice.value}`}
                      aria-pressed={active}
                      className={cn(
                        "h-9 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? choice.quantity === 0
                            ? "border-destructive bg-destructive text-destructive-foreground"
                            : "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent"
                      )}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* Abaixo da lista (e não acima): o aviso não empurra os botões e ninguém marca o dia errado. */}
      <FormMessage state={state} />
    </form>
  );
}

/** Marcar vários dias de uma vez (ex.: toda a semana como dia inteiro). */
export function AttendanceRangeForm({ employeeId, today }: { employeeId: string; today: string }) {
  const [state, formAction] = useFormState(setAttendanceAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="range_from">De</Label>
        <Input id="range_from" name="from" type="date" max={today} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="range_to">Até</Label>
        <Input id="range_to" name="to" type="date" max={today} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="range_quantity">Marcar como</Label>
        <NativeSelect id="range_quantity" name="quantity" defaultValue="1" className={selectClass}>
          <option value="1">Dia inteiro</option>
          <option value="0.5">Meio dia</option>
          <option value="0">Falta</option>
          <option value="clear">Apagar marcações</option>
        </NativeSelect>
      </div>
      <SubmitButton state={state} pendingLabel="Marcando..." successLabel="Marcado">Marcar período</SubmitButton>
    </form>
  );
}

export function AdjustmentForm({ employeeId, today }: { employeeId: string; today: string }) {
  const [state, formAction] = useFormState(addAdjustmentAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adj_kind">Tipo</Label>
        <NativeSelect id="adj_kind" name="kind" defaultValue="advance" className={selectClass}>
          <option value="advance">Vale (adiantamento já pago)</option>
          <option value="deduction">Desconto</option>
          <option value="bonus">Bônus / gorjeta</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adj_amount">Valor (R$)</Label>
        <Input id="adj_amount" name="amount" inputMode="decimal" placeholder="0,00" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adj_date">Data</Label>
        <Input id="adj_date" name="occurred_on" type="date" defaultValue={today} max={today} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adj_method">Se for vale: como foi pago?</Label>
        <NativeSelect id="adj_method" name="method" defaultValue="cash" className={selectClass}>
          <option value="cash">Dinheiro (sai do caixa aberto)</option>
          <option value="pix">Pix</option>
          <option value="other">Outro</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="adj_desc">Observação</Label>
        <Input id="adj_desc" name="description" maxLength={300} placeholder="Ex.: adiantamento para passagem" />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        O vale já sai do Financeiro/Caixa na hora e é descontado no próximo fechamento. Desconto e bônus só entram no fechamento.
      </p>
      <SubmitButton state={state} pendingLabel="Registrando..." successLabel="Registrado" className="w-full sm:w-fit">Registrar</SubmitButton>
    </form>
  );
}

export function DeleteAdjustmentButton({ adjustmentId, employeeId }: { adjustmentId: string; employeeId: string }) {
  const [state, formAction] = useFormState(deleteAdjustmentAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button type="submit" variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive">Apagar</Button>
      <FormMessage state={state} />
    </form>
  );
}

export function ClosePeriodForm({
  employeeId,
  start,
  end,
  dueOn,
}: {
  employeeId: string;
  start: string;
  end: string;
  dueOn: string;
}) {
  const [state, formAction] = useFormState(closePeriodAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="period_start" value={start} />
      <input type="hidden" name="period_end" value={end} />
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="close_due">Data prevista do pagamento</Label>
        <Input id="close_due" name="due_on" type="date" defaultValue={dueOn} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="close_notes">Observação (sai no recibo)</Label>
        <Input id="close_notes" name="notes" maxLength={1000} />
      </div>
      <SubmitButton state={state} pendingLabel="Fechando..." successLabel="Fechado" className="w-full sm:w-fit">Fechar período e gerar pagamento</SubmitButton>
    </form>
  );
}

export function PayPaymentForm({ paymentId, today, defaultMethod }: { paymentId: string; today: string; defaultMethod?: string }) {
  const [state, formAction] = useFormState(payPaymentAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3 sm:items-end">
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pay_method">Como foi pago?</Label>
        <NativeSelect id="pay_method" name="method" defaultValue={defaultMethod ?? "pix"} className={selectClass}>
          <option value="cash">Dinheiro (sai do caixa aberto)</option>
          <option value="pix">Pix</option>
          <option value="other">Outro</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pay_date">Data do pagamento</Label>
        <Input id="pay_date" name="paid_on" type="date" defaultValue={today} max={today} />
      </div>
      <SubmitButton state={state} pendingLabel="Registrando..." successLabel="Pago">Marcar como pago</SubmitButton>
    </form>
  );
}

export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const [state, formAction] = useFormState(cancelPaymentAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <FormMessage state={state} />
      <Button type="submit" variant="outline" size="sm">Cancelar este pagamento</Button>
    </form>
  );
}

export function ClosePayrollForm({
  employeeId,
  month,
  overtime50,
  overtime100,
  absences,
  dueOn,
}: {
  employeeId: string;
  month: string;
  overtime50: string;
  overtime100: string;
  absences: string;
  dueOn: string;
}) {
  const [state, formAction] = useFormState(closePayrollAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="overtime50" value={overtime50} />
      <input type="hidden" name="overtime100" value={overtime100} />
      <input type="hidden" name="absences" value={absences} />
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="payroll_due">Data prevista do pagamento</Label>
        <Input id="payroll_due" name="due_on" type="date" defaultValue={dueOn} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="payroll_notes">Observação (sai no recibo)</Label>
        <Input id="payroll_notes" name="notes" maxLength={1000} />
      </div>
      <SubmitButton state={state} pendingLabel="Fechando..." successLabel="Fechado" className="w-full sm:w-fit">Fechar folha e gerar pagamento</SubmitButton>
    </form>
  );
}

export function HrSettingsForm({ regime, inssPercent }: { regime: "simples" | "mei" | "other"; inssPercent: string }) {
  const [state, formAction] = useFormState(saveHrSettingsAction, initialState);
  const keepInput = useKeepInputOnError(state);
  return (
    <form action={formAction} onReset={keepInput} className="grid gap-4 rounded-lg border p-4">
      <FormMessage state={state} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Regime da empresa</legend>
        {(
          [
            ["simples", "Simples Nacional", "O INSS patronal já está dentro do DAS. A folha estimada não soma INSS patronal separado."],
            ["mei", "MEI", "Paga 3% de INSS sobre o salário e 8% de FGTS. Só pode ter 1 empregado, com salário de até 1 mínimo (ou o piso da categoria)."],
            ["other", "Outro regime", "Informe o percentual de INSS patronal que o seu contador indicou."],
          ] as const
        ).map(([key, title, description]) => (
          <label key={key} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-accent">
            <input type="radio" name="employer_regime" value={key} defaultChecked={regime === key} className="mt-1" />
            <span>
              <span className="font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2 sm:max-w-xs">
        <Label htmlFor="employer_inss_percent">Percentual de INSS patronal (só para “Outro regime”)</Label>
        <Input id="employer_inss_percent" name="employer_inss_percent" inputMode="decimal" defaultValue={inssPercent} placeholder="20,00" />
      </div>
      <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">Salvar configurações</SubmitButton>
    </form>
  );
}
