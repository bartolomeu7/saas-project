"use client";

import { useFormState } from "react-dom";
import { updateCompanyProfileAction } from "@/lib/companies/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { Company } from "@/types/company";
import { BRAZIL_UFS } from "@/lib/validations/brazil-ufs";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormField, fieldError } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};

type ProfileValues = Pick<
  Company,
  "legal_name" | "document" | "phone" | "whatsapp" | "email" | "website" | "postal_code" | "address" | "address_number" | "complement" | "neighborhood" | "city" | "state"
>;

/**
 * Dados cadastrais da empresa: aparecem no PDF do orçamento. Tudo é opcional, mas o que for preenchido é conferido no
 * servidor (CPF/CNPJ, telefone, e-mail, CEP, UF) e de novo no banco. Só proprietário e administradores chegam aqui.
 */
export function CompanyProfileForm({ values }: { values: ProfileValues }) {
  const [state, formAction] = useFormState(updateCompanyProfileAction, initialState);
  const keepInput = useKeepInputOnError(state);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Identificação</legend>
        <FormField label="Razão social" error={fieldError(state, "legalName")} className="sm:col-span-2" hint="Nome completo da empresa, como no CNPJ.">
          <Input name="legalName" defaultValue={values.legal_name ?? ""} maxLength={180} autoComplete="organization" />
        </FormField>
        <FormField label="CNPJ ou CPF" error={fieldError(state, "document")} hint="Só números ou com pontuação.">
          <Input name="document" defaultValue={values.document ?? ""} maxLength={32} inputMode="numeric" autoComplete="off" />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Contato</legend>
        <FormField label="Telefone" error={fieldError(state, "phone")}>
          <Input name="phone" defaultValue={values.phone ?? ""} maxLength={32} inputMode="tel" autoComplete="tel" />
        </FormField>
        <FormField label="WhatsApp" error={fieldError(state, "whatsapp")}>
          <Input name="whatsapp" defaultValue={values.whatsapp ?? ""} maxLength={32} inputMode="tel" autoComplete="off" />
        </FormField>
        <FormField label="E-mail" error={fieldError(state, "email")}>
          <Input name="email" type="email" defaultValue={values.email ?? ""} maxLength={160} autoComplete="email" />
        </FormField>
        <FormField label="Site" error={fieldError(state, "website")} hint="Ex.: www.suaempresa.com.br">
          <Input name="website" defaultValue={values.website ?? ""} maxLength={160} inputMode="url" autoComplete="url" />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-6">
        <legend className="mb-1 text-sm font-medium">Endereço</legend>
        <FormField label="CEP" error={fieldError(state, "postalCode")} className="sm:col-span-2">
          <Input name="postalCode" defaultValue={values.postal_code ?? ""} maxLength={16} inputMode="numeric" autoComplete="postal-code" />
        </FormField>
        <FormField label="Endereço" error={fieldError(state, "address")} className="sm:col-span-3">
          <Input name="address" defaultValue={values.address ?? ""} maxLength={200} autoComplete="address-line1" />
        </FormField>
        <FormField label="Número" error={fieldError(state, "addressNumber")} className="sm:col-span-1">
          <Input name="addressNumber" defaultValue={values.address_number ?? ""} maxLength={20} autoComplete="off" />
        </FormField>
        <FormField label="Complemento" error={fieldError(state, "complement")} className="sm:col-span-2">
          <Input name="complement" defaultValue={values.complement ?? ""} maxLength={100} autoComplete="address-line2" />
        </FormField>
        <FormField label="Bairro" error={fieldError(state, "neighborhood")} className="sm:col-span-2">
          <Input name="neighborhood" defaultValue={values.neighborhood ?? ""} maxLength={100} autoComplete="off" />
        </FormField>
        <FormField label="Cidade" error={fieldError(state, "city")} className="sm:col-span-1">
          <Input name="city" defaultValue={values.city ?? ""} maxLength={100} autoComplete="address-level2" />
        </FormField>
        <FormField label="UF" error={fieldError(state, "state")} className="sm:col-span-1">
          <NativeSelect name="state" defaultValue={values.state ?? ""}>
            <option value="">—</option>
            {BRAZIL_UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </fieldset>

      <FormMessage state={state} />
      <div>
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
          Salvar dados da empresa
        </SubmitButton>
      </div>
    </form>
  );
}
