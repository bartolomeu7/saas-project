"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import type { ProductCategory, ProductFormFields } from "@/types/product";
import { PRODUCT_UNIT_LABELS } from "@/types/product";
import { calculateMargin } from "@/types/product";
import type { ProductSegmentHints } from "@/config/product-segments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};

const PRODUCT_UNITS = Object.keys(PRODUCT_UNIT_LABELS) as (keyof typeof PRODUCT_UNIT_LABELS)[];

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ProductFormProps {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<ProductFormFields>;
  categories: ProductCategory[];
  /**
   * Nome da categoria atual do produto, mesmo que ela já tenha sido
   * desativada (e por isso não apareça em `categories`, que só lista
   * ativas). Sem isso, o `<select>` não teria nenhuma opção
   * correspondente ao `category_id` atual, o navegador cairia para a
   * primeira opção ("Sem categoria") e salvar sem tocar o campo apagaria
   * a categoria do produto silenciosamente.
   */
  currentCategoryName?: string | null;
  segmentHints: ProductSegmentHints;
  submitLabel: string;
}

export function ProductForm({
  action,
  defaultValues,
  categories,
  currentCategoryName,
  segmentHints,
  submitLabel,
}: ProductFormProps) {
  const [state, formAction] = useFormState(action, initialState);
  const [costPrice, setCostPrice] = useState(String(defaultValues?.cost_price ?? ""));
  const [salePrice, setSalePrice] = useState(String(defaultValues?.sale_price ?? ""));
  // Edição (defaultValues presente) nunca deve poder sobrescrever o
  // estoque real através do formulário de cadastro — só a criação de um
  // produto novo define o estoque inicial livremente.
  const isEditing = defaultValues != null;

  const margin = useMemo(() => {
    const cost = Number(costPrice.replace(",", ".")) || 0;
    const sale = Number(salePrice.replace(",", ".")) || 0;
    return calculateMargin(cost, sale);
  }, [costPrice, salePrice]);

  // A categoria atual só precisa de uma opção extra se ela não estiver
  // entre as ativas (categoria já desativada) — nesse caso `categories`
  // (só ativas) não a contém.
  const currentCategoryIsInactive =
    !!defaultValues?.category_id &&
    !categories.some((category) => category.id === defaultValues.category_id);

  const identificationEmphasis = segmentHints.emphasize === "barcode";
  const stockEmphasis = segmentHints.emphasize === "unit_stock";

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

      <section
        className={cn(
          "flex flex-col gap-4 rounded-lg p-4",
          identificationEmphasis && "border border-primary/30 bg-primary/5"
        )}
      >
        <h2 className="text-sm font-semibold text-muted-foreground">
          Identificação
          {identificationEmphasis && (
            <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
              Recomendado para o seu segmento
            </span>
          )}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" name="sku" defaultValue={defaultValues?.sku ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="barcode">Código de barras</Label>
            <Input id="barcode" name="barcode" defaultValue={defaultValues?.barcode ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit">Unidade</Label>
            <select
              id="unit"
              name="unit"
              defaultValue={defaultValues?.unit ?? "un"}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit} — {PRODUCT_UNIT_LABELS[unit]}
                </option>
              ))}
            </select>
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

      <section
        className={cn(
          "flex flex-col gap-4 rounded-lg p-4",
          stockEmphasis && "border border-primary/30 bg-primary/5"
        )}
      >
        <h2 className="text-sm font-semibold text-muted-foreground">
          Estoque
          {stockEmphasis && (
            <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
              Recomendado para o seu segmento
            </span>
          )}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="stockQuantity">Estoque atual</Label>
            <Input
              id="stockQuantity"
              name="stockQuantity"
              type="number"
              step="0.001"
              min="0"
              defaultValue={defaultValues?.stock_quantity ?? 0}
              disabled={isEditing}
              readOnly={isEditing}
              className={cn(isEditing && "cursor-not-allowed opacity-70")}
            />
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                Editar o cadastro não altera o estoque — use &ldquo;Ajustar estoque&rdquo;
                na página do produto para isso (mantém histórico e evita perder uma
                baixa/entrada registrada nesse meio-tempo).
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="minimumStock">Estoque mínimo</Label>
            <Input
              id="minimumStock"
              name="minimumStock"
              type="number"
              step="0.001"
              min="0"
              defaultValue={defaultValues?.minimum_stock ?? 0}
            />
          </div>
        </div>
      </section>

      <SubmitButton pendingLabel="Salvando..." className="w-full sm:w-fit">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
