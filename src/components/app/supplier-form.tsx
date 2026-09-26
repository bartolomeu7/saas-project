"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { SupplierFormFields } from "@/types/supplier";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

export function SupplierForm({ action, defaultValues, submitLabel }: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<SupplierFormFields>;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const field = (key: keyof SupplierFormFields) => defaultValues?.[key] ?? "";
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <section className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="name">Nome *</Label><Input id="name" name="name" defaultValue={field("name")} required /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="legal_name">Razão social</Label><Input id="legal_name" name="legal_name" defaultValue={field("legal_name")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="document">CPF/CNPJ</Label><Input id="document" name="document" defaultValue={field("document")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" defaultValue={field("email")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="phone">Telefone</Label><Input id="phone" name="phone" defaultValue={field("phone")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" name="whatsapp" defaultValue={field("whatsapp")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="address">Endereço</Label><Input id="address" name="address" defaultValue={field("address")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="address_number">Número</Label><Input id="address_number" name="address_number" defaultValue={field("address_number")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="complement">Complemento</Label><Input id="complement" name="complement" defaultValue={field("complement")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="neighborhood">Bairro</Label><Input id="neighborhood" name="neighborhood" defaultValue={field("neighborhood")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="city">Cidade</Label><Input id="city" name="city" defaultValue={field("city")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="state">UF</Label><Input id="state" name="state" maxLength={2} defaultValue={field("state")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="postal_code">CEP</Label><Input id="postal_code" name="postal_code" defaultValue={field("postal_code")} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="status">Status</Label><select id="status" name="status" defaultValue={field("status") || "active"} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="notes">Observações</Label><textarea id="notes" name="notes" rows={3} defaultValue={field("notes")} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
      </section>
      <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">{submitLabel}</SubmitButton>
    </form>
  );
}