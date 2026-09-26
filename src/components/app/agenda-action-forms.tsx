"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import {
  createAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentStatusAction,
} from "@/lib/agenda/actions";
import type { Appointment } from "@/types/appointment";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: ActionResult = {};

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
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [price, setPrice] = useState(services[0] ? String(services[0].sale_price) : "");
  const [startsAt, setStartsAt] = useState(date + "T08:00");
  const service = services.find((row) => row.id === serviceId);

  useEffect(() => {
    if (service) setPrice(String(service.sale_price));
  }, [service?.id, service?.sale_price]);

  return (
    <form action={formAction} className="grid gap-4">
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

  return (
    <form action={formAction}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton state={state}
        pendingLabel="..."
        variant={destructive ? "outline" : "default"}
        className={destructive ? "w-auto text-destructive" : "w-auto"}
        size="sm"
      >
        {label}
      </SubmitButton>
      {state.error || state.success ? <div className="mt-2 max-w-xs"><FormMessage state={state} /></div> : null}
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

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="appointmentId" value={appointment.id} />
      <input name="startsAt" type="datetime-local" defaultValue={defaultValue} className="h-9 rounded-md border bg-background px-2 text-sm" />
      <SubmitButton state={state} pendingLabel="..." size="sm" className="w-auto">Reagendar</SubmitButton>
      <div className="sm:col-span-2">{state.error || state.success ? <FormMessage state={state} /> : null}</div>
    </form>
  );
}
