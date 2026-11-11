"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import {
  completeAppointmentAction,
  createAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentStatusAction,
} from "@/lib/agenda/actions";
import type { Appointment } from "@/types/appointment";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};

/** Agora em São Paulo no formato do campo datetime-local (AAAA-MM-DDTHH:mm). */
function nowSaoPauloLocal(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T").slice(0, 16);
}

/** Avisos (não bloqueiam): horário que já passou e atendimento que termina depois da meia-noite. */
export function scheduleWarnings(startsAt: string, durationMinutes: number, nowLocal: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(startsAt);
  if (!match) return [];
  const warnings: string[] = [];
  if (startsAt < nowLocal) warnings.push("Esse horário já passou. Confira a data se não quiser registrar um atendimento passado.");
  if (durationMinutes > 0) {
    const [y, mo, d, h, mi] = match.slice(1).map(Number) as [number, number, number, number, number];
    const start = Date.UTC(y, mo - 1, d, h, mi);
    const end = new Date(start + durationMinutes * 60000);
    // Termina exatamente às 00:00 do dia seguinte = ainda cabe no dia; só avisa se passar disso.
    const endsExactlyAtMidnight = end.getTime() === Date.UTC(y, mo - 1, d + 1);
    if (end.getUTCDate() !== d && !endsExactlyAtMidnight) {
      const hh = String(end.getUTCHours()).padStart(2, "0");
      const mm = String(end.getUTCMinutes()).padStart(2, "0");
      warnings.push(`Esse atendimento termina depois da meia-noite (${hh}:${mm} do dia seguinte). Confira o horário.`);
    }
  }
  return warnings;
}

export function AppointmentForm({
  date,
  customers,
  services,
  professionals,
}: {
  date: string;
  customers: { id: string; name: string }[];
  services: { id: string; name: string; duration_minutes: number; sale_price: number }[];
  professionals: { id: string; display_name: string; color: string }[];
}) {
  const [state, formAction] = useFormState(createAppointmentAction, initialState);
  const keepInput = useKeepInputOnError(state);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [price, setPrice] = useState(services[0] ? String(services[0].sale_price) : "");
  const [startsAt, setStartsAt] = useState(date + "T08:00");
  const service = services.find((row) => row.id === serviceId);
  const [nowLocal, setNowLocal] = useState("");
  useEffect(() => setNowLocal(nowSaoPauloLocal()), [startsAt]);
  const warnings = nowLocal ? scheduleWarnings(startsAt, service?.duration_minutes ?? 0, nowLocal) : [];

  // Depende dos campos primitivos de propósito: `service` é um novo objeto
  // a cada render (retorno de `.find()`), então incluí-lo re-executaria o
  // efeito sempre, mesmo sem mudança real de id/preço.
  useEffect(() => {
    if (service) setPrice(String(service.sale_price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id, service?.sale_price]);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-4">
      <input type="hidden" name="durationMinutes" value={service?.duration_minutes ?? ""} />
      <input type="hidden" name="price" value={price} />
      <label className="grid gap-1 text-sm">
        Serviço
        <NativeSelect
          name="serviceId"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          className="h-10 rounded-md border bg-background px-3"
          required
        >
          <option value="">Selecione...</option>
          {services.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </NativeSelect>
      </label>
      <label className="grid gap-1 text-sm">
        Cliente
        <NativeSelect name="customerId" className="h-10 rounded-md border bg-background px-3">
          <option value="">Sem cliente definido</option>
          {customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </NativeSelect>
      </label>
      <label className="grid gap-1 text-sm">
        Profissional
        <NativeSelect name="professionalId" className="h-10 rounded-md border bg-background px-3">
          <option value="">Sem profissional definido</option>
          {professionals.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}
        </NativeSelect>
      </label>
      <label className="grid gap-1 text-sm">
        Horário
        <input
          name="startsAt"
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          className="h-10 rounded-md border bg-background px-3"
          required
        />
        {warnings.map((text) => (
          <span key={text} role="status" className="text-xs text-amber-600 dark:text-amber-400">⚠ {text}</span>
        ))}
      </label>
      <label className="grid gap-1 text-sm">
        Observações
        <textarea name="notes" rows={3} className="rounded-md border bg-background px-3 py-2" />
      </label>
      <SubmitButton state={state} pendingLabel="Agendando..." className="w-fit">Criar agendamento</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AppointmentStatusForm({
  appointmentId,
  status,
  label,
  destructive = false,
}: {
  appointmentId: string;
  status: "confirmed" | "completed" | "no_show" | "cancelled";
  label: string;
  destructive?: boolean;
}) {
  const [state, formAction] = useFormState(setAppointmentStatusAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={formAction} ref={formRef}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="status" value={status} />
      {status === "cancelled" ? (
        <ConfirmDialog
          trigger={<Button type="button" variant="outline" size="sm" className="w-auto text-destructive">{label}</Button>}
          title="Cancelar este agendamento?"
          description="O horário fica livre. Para voltar a atender, será preciso criar um novo agendamento."
          confirmLabel="Cancelar agendamento"
          cancelLabel="Voltar"
          destructive
          onConfirm={() => formRef.current?.requestSubmit()}
        />
      ) : (
        <SubmitButton state={state}
          pendingLabel="..."
          variant={destructive ? "outline" : "default"}
          className={destructive ? "w-auto text-destructive" : "w-auto"}
          size="sm"
        >
          {label}
        </SubmitButton>
      )}
      {state.error || state.success ? <div className="mt-2 max-w-xs"><FormMessage state={state} /></div> : null}
    </form>
  );
}

const COMPLETE_METHOD_KEY = "prime-ges:agenda:forma-de-recebimento";

const COMPLETE_METHOD_OPTIONS = [
  { value: "", label: "Cobrar depois (fica a receber)" },
  { value: "pix", label: "Recebi no Pix" },
  { value: "cash", label: "Recebi em dinheiro" },
  { value: "debit", label: "Recebi no débito" },
  { value: "credit", label: "Recebi no crédito" },
  { value: "other", label: "Recebi de outra forma" },
] as const;

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Concluir o atendimento já gera a venda (e o pagamento, se você marcar que recebeu), tudo de uma vez.
 * Sem forma de pagamento a venda fica "a receber". A última forma escolhida é lembrada neste aparelho.
 */
export function CompleteAppointmentForm({ appointment }: { appointment: Appointment }) {
  const [state, formAction] = useFormState(completeAppointmentAction, initialState);
  const keepInput = useKeepInputOnError(state);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState(String(appointment.price ?? 0));
  const price = Number(appointment.price ?? 0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COMPLETE_METHOD_KEY);
      if (saved && COMPLETE_METHOD_OPTIONS.some((option) => option.value === saved)) setMethod(saved);
    } catch {
      // sem armazenamento disponível: segue com o padrão (cobrar depois)
    }
  }, []);

  function chooseMethod(value: string) {
    setMethod(value);
    try {
      window.localStorage.setItem(COMPLETE_METHOD_KEY, value);
    } catch {
      // ignorar: só uma conveniência
    }
  }

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-2">
      <input type="hidden" name="appointmentId" value={appointment.id} />
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Recebimento
          <NativeSelect
            name="method"
            value={method}
            onChange={(event) => chooseMethod(event.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            {COMPLETE_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Valor recebido
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={method ? amount : ""}
            disabled={!method}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={method ? "" : "—"}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-50"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Gera a venda de {formatMoney(price)}
        {method ? " e registra o recebimento (entra no caixa aberto e no financeiro)." : " e deixa a receber (aparece em Contas a receber)."}
      </p>
      <SubmitButton state={state} pendingLabel="Concluindo..." successLabel="Concluído" size="sm" className="w-auto">
        Concluir serviço
      </SubmitButton>
      {state.error || state.success ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function RescheduleForm({
  appointment,
  defaultValue,
}: {
  appointment: Appointment;
  defaultValue: string;
}) {
  const [state, formAction] = useFormState(rescheduleAppointmentAction, initialState);
  const keepInput = useKeepInputOnError(state);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="appointmentId" value={appointment.id} />
      <input name="startsAt" type="datetime-local" defaultValue={defaultValue} className="h-9 rounded-md border bg-background px-2 text-sm" />
      <SubmitButton state={state} pendingLabel="..." size="sm" className="w-auto">Reagendar</SubmitButton>
      <div className="sm:col-span-2">{state.error || state.success ? <FormMessage state={state} /> : null}</div>
    </form>
  );
}
