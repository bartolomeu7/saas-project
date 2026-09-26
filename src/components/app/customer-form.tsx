"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";
import type { ActionResult } from "@/lib/auth/actions";
import type { CustomerFormFields } from "@/types/customer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};
const MAX_PREFERENCES = 10;

interface CustomerFormProps {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<CustomerFormFields>;
  submitLabel: string;
}

export function CustomerForm({
  action,
  defaultValues,
  submitLabel,
}: CustomerFormProps) {
  const [state, formAction] = useFormState(action, initialState);
  const [preferences, setPreferences] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(defaultValues?.preferences ?? {}).map(([key, value]) => ({
      key,
      value: String(value),
    }))
  );

  const preferencesJson = JSON.stringify(
    Object.fromEntries(
      preferences
        .map((p) => [p.key.trim(), p.value.trim()] as const)
        .filter(([key, value]) => key.length > 0 && value.length > 0)
    )
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FormMessage state={state} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Dados principais
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={defaultValues?.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="document">Documento</Label>
            <Input
              id="document"
              name="document"
              defaultValue={defaultValues?.document ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="birthDate">Aniversário</Label>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              defaultValue={defaultValues?.birth_date ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "active"}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Contato
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={defaultValues?.phone ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              defaultValue={defaultValues?.whatsapp ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Endereço
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="postalCode">CEP</Label>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={defaultValues?.postal_code ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              name="address"
              defaultValue={defaultValues?.address ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="addressNumber">Número</Label>
            <Input
              id="addressNumber"
              name="addressNumber"
              defaultValue={defaultValues?.address_number ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="complement">Complemento</Label>
            <Input
              id="complement"
              name="complement"
              defaultValue={defaultValues?.complement ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="neighborhood">Bairro</Label>
            <Input
              id="neighborhood"
              name="neighborhood"
              defaultValue={defaultValues?.neighborhood ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              name="city"
              defaultValue={defaultValues?.city ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="state">Estado</Label>
            <Input
              id="state"
              name="state"
              maxLength={2}
              placeholder="UF"
              defaultValue={defaultValues?.state ?? ""}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Preferências
          </h2>
          {preferences.length < MAX_PREFERENCES && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setPreferences((prev) => [...prev, { key: "", value: "" }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          )}
        </div>

        {preferences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma preferência registrada. Ex.: forma de pagamento preferida, produto favorito.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {preferences.map((pref, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label="Nome da preferência"
                  placeholder="Preferência (ex: forma de pagamento)"
                  value={pref.key}
                  maxLength={60}
                  onChange={(event) =>
                    setPreferences((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, key: event.target.value } : p))
                    )
                  }
                />
                <Input
                  aria-label="Valor da preferência"
                  placeholder="Valor (ex: Pix)"
                  value={pref.value}
                  maxLength={200}
                  onChange={(event) =>
                    setPreferences((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, value: event.target.value } : p))
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Remover preferência"
                  onClick={() => setPreferences((prev) => prev.filter((_, i) => i !== index))}
                  className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input type="hidden" name="preferences" value={preferencesJson} />
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="notes">Observações</Label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={defaultValues?.notes ?? ""}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </section>

      <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
