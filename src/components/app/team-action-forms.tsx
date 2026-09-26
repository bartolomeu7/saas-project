"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import {
  addExistingMemberAction,
  createProfessionalBlockAction,
  deleteProfessionalBlockAction,
  removeMemberAction,
  saveProfessionalAction,
  saveProfessionalAvailabilityAction,
  saveProfessionalServicesAction,
  updateMemberRoleAction,
} from "@/lib/team/actions";
import type { TeamMember } from "@/types/team";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: ActionResult = {};

const weekdays = [
  ["0", "Domingo"],
  ["1", "Segunda"],
  ["2", "Terça"],
  ["3", "Quarta"],
  ["4", "Quinta"],
  ["5", "Sexta"],
  ["6", "Sábado"],
] as const;

const colors = [
  ["sky", "Azul"],
  ["emerald", "Verde"],
  ["violet", "Violeta"],
  ["amber", "Âmbar"],
  ["rose", "Rosa"],
  ["slate", "Cinza"],
] as const;

export function AddMemberForm() {
  const [state, formAction] = useFormState(addExistingMemberAction, initialState);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
      <input
        name="email"
        type="email"
        required
        placeholder="email@exemplo.com"
        className="h-10 rounded-md border bg-background px-3"
      />
      <NativeSelect name="role" defaultValue="employee" className="h-10 rounded-md border bg-background px-3">
        <option value="employee">Funcionário</option>
        <option value="admin">Administrador</option>
      </NativeSelect>
      <SubmitButton state={state} pendingLabel="Adicionando..." className="w-auto">
        Adicionar
      </SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function MemberRoleForm({ member }: { member: TeamMember }) {
  const [state, formAction] = useFormState(updateMemberRoleAction, initialState);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[130px_auto]">
      <input type="hidden" name="memberId" value={member.member_id} />
      <NativeSelect name="role" defaultValue={member.role} className="h-9 rounded-md border bg-background px-2 text-sm">
        <option value="owner">Owner</option>
        <option value="admin">Administrador</option>
        <option value="employee">Funcionário</option>
      </NativeSelect>
      <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
        Salvar
      </SubmitButton>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}

export function RemoveMemberForm({ memberId }: { memberId: string }) {
  const [state, formAction] = useFormState(removeMemberAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="memberId" value={memberId} />
      <SubmitButton state={state} pendingLabel="Removendo..." variant="outline" className="w-auto text-destructive">
        Remover
      </SubmitButton>
      {state.error || state.success ? <div className="mt-2 max-w-xs"><FormMessage state={state} /></div> : null}
    </form>
  );
}

export function ProfessionalForm({ member }: { member: TeamMember }) {
  const [state, formAction] = useFormState(saveProfessionalAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="companyMemberId" value={member.member_id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Nome profissional
          <input
            name="displayName"
            required
            defaultValue={member.display_name ?? member.full_name ?? ""}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Telefone
          <input name="phone" defaultValue={member.phone ?? ""} className="h-10 rounded-md border bg-background px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Especialidade
          <input
            name="specialty"
            defaultValue={member.specialty ?? ""}
            className="h-10 rounded-md border bg-background px-3"
            placeholder="Ex.: barbeiro, mecânico..."
          />
        </label>
        <label className="grid gap-1 text-sm">
          Cor na agenda
          <NativeSelect name="color" defaultValue={member.color ?? "sky"} className="h-10 rounded-md border bg-background px-3">
            {colors.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Observações
        <textarea name="notes" rows={3} defaultValue={member.notes ?? ""} className="rounded-md border bg-background px-3 py-2" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={member.professional_active ?? true} />
        Disponível para a agenda
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-fit">Salvar ficha profissional</SubmitButton>
        {state.success || state.error ? <FormMessage state={state} /> : null}
      </div>
    </form>
  );
}

export function ProfessionalServicesForm({
  professionalId,
  services,
  selected,
}: {
  professionalId: string;
  services: { id: string; name: string; duration_minutes: number; sale_price: number }[];
  selected: {
    service_id: string;
    duration_override_minutes: number | null;
    price_override: number | null;
  }[];
}) {
  const [state, formAction] = useFormState(saveProfessionalServicesAction, initialState);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(selected.map((row) => [row.service_id, true]))
  );
  const [overrides, setOverrides] = useState<Record<string, { duration: string; price: string }>>(
    Object.fromEntries(
      selected.map((row) => [
        row.service_id,
        {
          duration: row.duration_override_minutes?.toString() ?? "",
          price: row.price_override?.toString() ?? "",
        },
      ])
    )
  );

  const payload = useMemo(
    () =>
      JSON.stringify(
        services
          .filter((service) => checked[service.id])
          .map((service) => ({
            service_id: service.id,
            duration_override_minutes: overrides[service.id]?.duration || null,
            price_override: overrides[service.id]?.price || null,
          }))
      ),
    [checked, overrides, services]
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="professionalId" value={professionalId} />
      <input type="hidden" name="services" value={payload} />
      {services.map((service) => (
        <div key={service.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(checked[service.id])}
              onChange={(event) => setChecked((current) => ({ ...current, [service.id]: event.target.checked }))}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{service.name}</span>
              <span className="block text-xs text-muted-foreground">
                {service.duration_minutes} min • R$ {Number(service.sale_price).toFixed(2).replace(".", ",")}
              </span>
            </span>
          </label>
          <input
            value={overrides[service.id]?.duration ?? ""}
            onChange={(event) => setOverrides((current) => ({
              ...current,
              [service.id]: { duration: event.target.value, price: current[service.id]?.price ?? "" },
            }))}
            placeholder="Duração"
            inputMode="numeric"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label={"Duração personalizada de " + service.name}
          />
          <input
            value={overrides[service.id]?.price ?? ""}
            onChange={(event) => setOverrides((current) => ({
              ...current,
              [service.id]: { duration: current[service.id]?.duration ?? "", price: event.target.value },
            }))}
            placeholder="Preço"
            inputMode="decimal"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label={"Preço personalizado de " + service.name}
          />
        </div>
      ))}
      {!services.length ? <p className="text-sm text-muted-foreground">Cadastre serviços ativos antes de habilitá-los para o profissional.</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-fit">Salvar serviços</SubmitButton>
        {state.success || state.error ? <FormMessage state={state} /> : null}
      </div>
    </form>
  );
}

export function ProfessionalAvailabilityForm({
  professionalId,
  availability,
}: {
  professionalId: string;
  availability: { weekday: number; start_time: string; end_time: string; active: boolean }[];
}) {
  const [state, formAction] = useFormState(saveProfessionalAvailabilityAction, initialState);
  const [rows, setRows] = useState(() =>
    weekdays.map(([weekday]) => {
      const match = availability.find((item) => item.weekday === Number(weekday) && item.active);
      return {
        weekday: Number(weekday),
        active: Boolean(match),
        start: match?.start_time?.slice(0, 5) ?? "08:00",
        end: match?.end_time?.slice(0, 5) ?? "18:00",
      };
    })
  );

  const payload = JSON.stringify(
    rows.filter((row) => row.active).map((row) => ({
      weekday: row.weekday,
      start_time: row.start,
      end_time: row.end,
      active: true,
    }))
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="professionalId" value={professionalId} />
      <input type="hidden" name="schedule" value={payload} />
      {rows.map((row, index) => (
        <div key={row.weekday} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[110px_auto_1fr_1fr] sm:items-center">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={row.active}
              onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, active: event.target.checked } : item))}
            />
            {weekdays.find(([value]) => Number(value) === row.weekday)?.[1]}
          </label>
          <span className="text-xs text-muted-foreground">Das</span>
          <input
            type="time"
            value={row.start}
            onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, start: event.target.value } : item))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
          <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-muted-foreground">
            <span>até</span>
            <input
              type="time"
              value={row.end}
              onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, end: event.target.value } : item))}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-fit">Salvar disponibilidade</SubmitButton>
        {state.success || state.error ? <FormMessage state={state} /> : null}
      </div>
    </form>
  );
}

export function ProfessionalBlockForm({ professionalId }: { professionalId: string }) {
  const [state, formAction] = useFormState(createProfessionalBlockAction, initialState);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="professionalId" value={professionalId} />
      <label className="grid gap-1 text-sm">
        Início
        <input name="startsAt" type="datetime-local" required className="h-10 rounded-md border bg-background px-3" />
      </label>
      <label className="grid gap-1 text-sm">
        Fim
        <input name="endsAt" type="datetime-local" required className="h-10 rounded-md border bg-background px-3" />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Motivo
        <input name="reason" placeholder="Almoço, folga, compromisso..." className="h-10 rounded-md border bg-background px-3" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton state={state} pendingLabel="Bloqueando..." className="w-fit">Bloquear horário</SubmitButton>
        {state.success || state.error ? <FormMessage state={state} /> : null}
      </div>
    </form>
  );
}

export function DeleteBlockForm({ blockId }: { blockId: string }) {
  const [state, formAction] = useFormState(deleteProfessionalBlockAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="blockId" value={blockId} />
      <SubmitButton state={state} pendingLabel="Removendo..." variant="outline" className="w-auto">Remover</SubmitButton>
      {state.error || state.success ? <div className="mt-2"><FormMessage state={state} /></div> : null}
    </form>
  );
}
