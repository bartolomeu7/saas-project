"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import {
  createLoyaltyMultiplierAction,
  updateLoyaltyMultiplierAction,
  deleteLoyaltyMultiplierAction,
} from "@/lib/loyalty/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { LoyaltyMultiplier } from "@/types/loyalty";
import type { ProductPick, ServicePick } from "@/types/sale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { EmptyState } from "@/components/app/empty-state";
import { ProductPicker } from "@/components/app/product-picker";
import { ServicePicker } from "@/components/app/service-picker";

const initialState: ActionResult = {};

function MultiplierEditForm({
  multiplierId,
  currentValue,
  onCancel,
  onSaved,
}: {
  multiplierId: string;
  currentValue: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const action = updateLoyaltyMultiplierAction.bind(null, multiplierId);
  const [state, formAction] = useFormState(action, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`multiplier-${multiplierId}`}>Multiplicador</Label>
          <Input
            id={`multiplier-${multiplierId}`}
            name="multiplier"
            type="number"
            min="0"
            max="100"
            step="0.1"
            defaultValue={currentValue}
            required
            className="w-24"
          />
        </div>
        <SubmitButton pendingLabel="Salvando..." size="sm" className="w-auto">
          Salvar
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Cancelar edição"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function MultiplierRow({
  multiplier,
  canEdit,
}: {
  multiplier: LoyaltyMultiplier;
  canEdit: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    if (
      !window.confirm(
        `Remover o multiplicador de "${multiplier.targetName}"? A partir de agora, vendas desse item voltam a valer 1x.`
      )
    ) {
      return;
    }
    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteLoyaltyMultiplierAction(multiplier.id);
      if (result.error) setDeleteError(result.error);
    });
  }

  if (isEditing) {
    return (
      <tr>
        <td colSpan={5} className="bg-secondary/30 px-4 py-3">
          <MultiplierEditForm
            multiplierId={multiplier.id}
            currentValue={multiplier.multiplier}
            onCancel={() => setIsEditing(false)}
            onSaved={() => setIsEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 text-muted-foreground">
        {multiplier.targetType === "product" ? "Produto" : "Serviço"}
      </td>
      <td className="px-4 py-3 font-medium text-foreground">{multiplier.targetName}</td>
      <td className="px-4 py-3 text-foreground">{multiplier.multiplier}x</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
          Ativo
        </span>
      </td>
      {canEdit && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="flex items-center gap-1 text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </button>
          </div>
          {deleteError && <p className="mt-1 text-xs text-destructive">{deleteError}</p>}
        </td>
      )}
    </tr>
  );
}

function NewMultiplierForm({
  existingProductIds,
  existingServiceIds,
  onCancel,
  onSaved,
}: {
  existingProductIds: string[];
  existingServiceIds: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [targetType, setTargetType] = useState<"product" | "service">("product");
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string } | null>(null);
  const [state, formAction] = useFormState(createLoyaltyMultiplierAction, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleTypeChange(type: "product" | "service") {
    setTargetType(type);
    setSelectedItem(null); // Nunca deixa um item do tipo anterior "grudado" ao trocar.
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange("product")}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              targetType === "product"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            Produto
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("service")}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              targetType === "service"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            Serviço
          </button>
        </div>
      </div>

      {!selectedItem ? (
        <div className="flex flex-col gap-1.5">
          <Label>Item</Label>
          {targetType === "product" ? (
            <ProductPicker
              mode="select"
              excludeIds={existingProductIds}
              onSelect={(product: ProductPick) => setSelectedItem({ id: product.id, name: product.name })}
            />
          ) : (
            <ServicePicker
              mode="select"
              excludeIds={existingServiceIds}
              onSelect={(service: ServicePick) => setSelectedItem({ id: service.id, name: service.name })}
            />
          )}
          <button
            type="button"
            onClick={onCancel}
            className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={selectedItem.id} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Item selecionado</Label>
              <p className="flex h-10 items-center rounded-md border border-input bg-secondary/50 px-3 text-sm text-foreground">
                {selectedItem.name}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-multiplier">Multiplicador</Label>
              <Input
                id="new-multiplier"
                name="multiplier"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="Ex: 2"
                required
                className="w-28"
              />
            </div>
            <SubmitButton pendingLabel="Salvando..." size="sm" className="w-auto">
              Salvar
            </SubmitButton>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Trocar item
            </button>
          </div>
          <FieldHintMultiplier />
          <FormMessage state={state} />
        </form>
      )}
    </div>
  );
}

function FieldHintMultiplier() {
  return (
    <p className="text-xs text-muted-foreground">
      Quantas vezes os pontos normais este item concede. Ex.: 2 = o dobro de pontos nas compras
      deste item.
    </p>
  );
}

export function LoyaltyMultipliersSection({
  multipliers,
  canEdit,
}: {
  multipliers: LoyaltyMultiplier[];
  canEdit: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);

  const existingProductIds = multipliers
    .filter((m) => m.targetType === "product")
    .map((m) => m.targetId);
  const existingServiceIds = multipliers
    .filter((m) => m.targetType === "service")
    .map((m) => m.targetId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Multiplicadores</h2>
        <p className="text-xs text-muted-foreground">
          Faça produtos ou serviços específicos renderem mais (ou menos) pontos de fidelidade do
          que a regra padrão. Sem um multiplicador, o item vale 1x.
        </p>
      </div>

      {multipliers.length === 0 ? (
        <EmptyState
          title="Nenhum multiplicador configurado ainda."
          description="Todos os produtos e serviços valem a pontuação padrão (1x) até que você configure um multiplicador específico."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Multiplicador</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canEdit && <th className="px-4 py-3 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {multipliers.map((multiplier) => (
                <MultiplierRow key={multiplier.id} multiplier={multiplier} canEdit={canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit &&
        (isAdding ? (
          <NewMultiplierForm
            existingProductIds={existingProductIds}
            existingServiceIds={existingServiceIds}
            onCancel={() => setIsAdding(false)}
            onSaved={() => setIsAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            + Novo multiplicador
          </button>
        ))}
    </div>
  );
}
