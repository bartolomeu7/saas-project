"use client";

import { useFormState } from "react-dom";
import { updateOwnCompanyAction } from "@/lib/companies/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { BUSINESS_TYPE_LABELS, type BusinessType } from "@/types/company";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormField, fieldError } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};
const OPTIONS = Object.entries(BUSINESS_TYPE_LABELS) as [BusinessType, string][];

/** Nome e segmento da empresa. Só proprietário e administradores chegam aqui; o banco confere o papel de novo. */
export function CompanyEditForm({ name, businessType }: { name: string; businessType: BusinessType }) {
  const [state, formAction] = useFormState(updateOwnCompanyAction, initialState);
  const keepInput = useKeepInputOnError(state);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-4 sm:grid-cols-2">
      <FormField label="Nome da empresa" error={fieldError(state, "name")} className="sm:col-span-2">
        <Input name="name" defaultValue={name} required minLength={2} maxLength={160} autoComplete="organization" />
      </FormField>
      <FormField label="Segmento" error={fieldError(state, "businessType")} className="sm:col-span-2">
        <NativeSelect name="businessType" defaultValue={businessType} required>
          {OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
          Salvar alterações
        </SubmitButton>
      </div>
    </form>
  );
}
