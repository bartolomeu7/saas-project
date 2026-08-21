"use client";

import { useFormState } from "react-dom";
import { createCompanyAction } from "@/lib/companies/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { BUSINESS_TYPE_LABELS, type BusinessType } from "@/types/company";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

const BUSINESS_TYPE_OPTIONS = Object.entries(BUSINESS_TYPE_LABELS) as [
  BusinessType,
  string
][];

export function CreateCompanyForm() {
  const [state, formAction] = useFormState(createCompanyAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome da empresa</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Ex: Padaria do João"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="businessType">Segmento</Label>
        <select
          id="businessType"
          name="businessType"
          required
          defaultValue=""
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="" disabled>
            Selecione um segmento
          </option>
          {BUSINESS_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <FormMessage state={state} />

      <SubmitButton pendingLabel="Criando empresa...">
        Concluir configuração
      </SubmitButton>
    </form>
  );
}
