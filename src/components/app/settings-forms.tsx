"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import { updateCompanySettingsAction, updateUserPreferencesAction } from "@/lib/settings/actions";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import type { CompanySettings, UserPreferences } from "@/types/settings";

const initialState: ActionResult = {};

export function CompanySettingsForm({ settings, canManage }: { settings: CompanySettings; canManage: boolean }) {
  const [state, formAction] = useFormState(updateCompanySettingsAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Fuso horário
          <input name="timezone" defaultValue={settings.timezone} required className="h-10 rounded-md border bg-background px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Localidade
          <input defaultValue={settings.locale} readOnly className="h-10 rounded-md border bg-muted px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Moeda
          <input defaultValue={settings.currency} readOnly className="h-10 rounded-md border bg-muted px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Início da semana
          <select name="weekStartsOn" defaultValue={String(settings.week_starts_on)} className="h-10 rounded-md border bg-background px-3">
            <option value="0">Domingo</option>
            <option value="1">Segunda-feira</option>
            <option value="2">Terça-feira</option>
            <option value="3">Quarta-feira</option>
            <option value="4">Quinta-feira</option>
            <option value="5">Sexta-feira</option>
            <option value="6">Sábado</option>
          </select>
        </label>
      </div>
      <div className="grid gap-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Notificações da empresa</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notificationsEnabled" defaultChecked={settings.notifications_enabled} />
          Notificações internas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="emailNotificationsEnabled" defaultChecked={settings.email_notifications_enabled} />
          Notificações por e-mail
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canManage ? <SubmitButton pendingLabel="Salvando..." className="w-fit">Salvar configurações</SubmitButton> : <span className="text-sm text-muted-foreground">Somente owner/admin podem alterar estas configurações.</span>}
        {state.error || state.success ? <FormMessage state={state} /> : null}
      </div>
    </form>
  );
}

export function UserPreferencesForm({ preferences }: { preferences: UserPreferences }) {
  const [state, formAction] = useFormState(updateUserPreferencesAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Tema
          <select name="theme" defaultValue={preferences.theme} className="h-10 rounded-md border bg-background px-3">
            <option value="system">Sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Densidade
          <select name="density" defaultValue={preferences.density} className="h-10 rounded-md border bg-background px-3">
            <option value="comfortable">Confortável</option>
            <option value="compact">Compacta</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Localidade</span>
          <input defaultValue={preferences.locale} readOnly className="h-10 rounded-md border bg-muted px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Fuso horário
          <input name="timezone" defaultValue={preferences.timezone} required className="h-10 rounded-md border bg-background px-3" />
        </label>
      </div>
      <div className="grid gap-2 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notificationsEnabled" defaultChecked={preferences.notifications_enabled} />
          Notificações internas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="emailNotificationsEnabled" defaultChecked={preferences.email_notifications_enabled} />
          Notificações por e-mail
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Salvando..." className="w-fit">Salvar preferências</SubmitButton>
        {state.error || state.success ? <FormMessage state={state} /> : null}
      </div>
    </form>
  );
}
