"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { ProductCategory } from "@/types/product";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: ActionResult = {};

export function CategoryForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<ProductCategory>;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome *</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <div className="flex flex-col gap-2 sm:w-48">
        <Label htmlFor="status">Status</Label>
        <NativeSelect
          id="status"
          name="status"
          defaultValue={defaultValues?.status ?? "active"}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </NativeSelect>
      </div>

      <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
