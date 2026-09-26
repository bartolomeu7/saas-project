"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { ServiceCategory, ServiceFormFields } from "@/types/service";
import { calculateMargin, formatDuration } from "@/types/service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ServiceFormProps {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<ServiceFormFields>;
  categories: ServiceCategory[];
  /** Ver o mesmo parâmetro em ProductForm — evita apagar silenciosamente a categoria do serviço quando ela já foi desativada. */
  currentCategoryName?: string | null;
  submitLabel: string;
}

export function ServiceForm({
  action,
  defaultValues,
  categories,
  currentCategoryName,
  submitLabel,
}: ServiceFormProps) {
  const currentCategoryIsInactive =
    !!defaultValues?.category_id &&
    !categories.some((category) => category.id === defaultValues.category_id);

  const [state, formAction] = useFormState(action, initialState);
  const [costPrice, setCostPrice] = useState(String(defaultValues?.cost_price ?? ""));
  const [salePrice, setSalePrice] = useState(String(defaultValues?.sale_price ?? ""));

  const initialTotalMinutes = defaultValues?.duration_minutes ?? 0;
  const [hours, setHours] = useState(String(Math.floor(initialTotalMinutes / 60) || ""));
  const [minutes, setMinutes] = useState(String(initialTotalMinutes % 60 || ""));

  const margin = useMemo(() => {
    const cost = Number(costPrice.replace(",", ".")) || 0;
    const sale = Number(salePrice.replace(",", ".")) || 0;
    return calculateMargin(cost, sale);
  }, [costPrice, salePrice]);

  const totalMinutes = useMemo(() => {
    const h = Math.max(0, Number(hours) || 0);
    const m = Math.max(0, Number(minutes) || 0);
    return h * 60 + m;
  }, [hours, minutes]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FormMessage state={state} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Informações</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" name="name" defaultValue={defaultValues?.name} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="categoryId">Categoria</Label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={defaultValues?.category_id ?? ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Sem categoria</option>
              {currentCategoryIsInactive && (
                <option value={defaultValues!.category_id!}>
                  {currentCategoryName ?? "Categoria atual"} (inativa)
                </option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
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
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="description">Descrição</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={defaultValues?.description ?? ""}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Preços</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="costPrice">Preço de custo</Label>
            <Input
              id="costPrice"
              name="costPrice"
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="salePrice">Preço de venda</Label>
            <Input
              id="salePrice"
              name="salePrice"
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Margem</Label>
            <div className="flex h-10 flex-col justify-center rounded-md border border-dashed border-border px-3 text-sm">
              <span className="text-foreground">{formatMoney(margin.value)}</span>
              <span className="text-xs text-muted-foreground">
                {margin.percentage === null
                  ? "Defina o preço de venda para calcular %"
                  : `${margin.percentage.toFixed(2)}% sobre a venda`}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Duração</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="durationHours">Horas</Label>
            <Input
              id="durationHours"
              type="number"
              step="1"
              min="0"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="durationMinutesField">Minutos</Label>
            <Input
              id="durationMinutesField"
              type="number"
              step="1"
              min="0"
              max="59"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Duração total</Label>
            <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-sm text-foreground">
              {formatDuration(totalMinutes)}
            </div>
          </div>
        </div>
        <input type="hidden" name="durationMinutes" value={totalMinutes} />
      </section>

      <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
