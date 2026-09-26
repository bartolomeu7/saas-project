"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import {
  createLoyaltyTierThresholdAction,
  updateLoyaltyTierThresholdAction,
  deleteLoyaltyTierThresholdAction,
} from "@/lib/loyalty/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { LoyaltyTierThreshold } from "@/types/loyalty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { ConfirmDialog } from "@/components/app/confirm-dialog";

const initialState: ActionResult = {};

function TierEditForm({
  threshold,
  onCancel,
  onSaved,
}: {
  threshold: LoyaltyTierThreshold;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isPersisted = Boolean(threshold.id);
  const action = isPersisted
    ? updateLoyaltyTierThresholdAction.bind(null, threshold.id!)
    : createLoyaltyTierThresholdAction;
  const [state, formAction] = useFormState(action, initialState);

  useEffect(() => {
    if (state.success) {
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldId = threshold.id ?? "new";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${fieldId}`}>Nome</Label>
          <Input
            id={`name-${fieldId}`}
            name="name"
            defaultValue={threshold.name}
            maxLength={60}
            required
            className="sm:w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`points-${fieldId}`}>Pontos mínimos</Label>
          <Input
            id={`points-${fieldId}`}
            name="minLifetimePoints"
            type="number"
            min="0"
            step="1"
            defaultValue={threshold.minLifetimePoints}
            required
            className="sm:w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton state={state} pendingLabel="Salvando..." size="sm" className="w-auto">
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
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function TierRow({
  threshold,
  order,
  canEdit,
  canDelete,
}: {
  threshold: LoyaltyTierThreshold;
  order: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isPersisted = Boolean(threshold.id);

  function handleDelete() {
    if (!threshold.id) return;
    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteLoyaltyTierThresholdAction(threshold.id!);
      if (result.error) {
        setDeleteError(result.error);
      }
    });
  }

  if (isEditing) {
    return (
      <tr>
        <td colSpan={4} className="bg-secondary/30 px-4 py-3">
          <TierEditForm
            threshold={threshold}
            onCancel={() => setIsEditing(false)}
            onSaved={() => setIsEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-foreground">{threshold.name}</td>
      <td className="px-4 py-3 text-muted-foreground">{threshold.minLifetimePoints}</td>
      <td className="px-4 py-3 text-muted-foreground">{order}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isPersisted ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {isPersisted ? "Ativo" : "Padrão (não salvo)"}
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
            {canDelete && isPersisted && (
              <ConfirmDialog
                title={`Excluir o nível "${threshold.name}"?`}
                description="Esta ação não pode ser desfeita."
                confirmLabel="Excluir"
                destructive
                onConfirm={handleDelete}
                trigger={
                  <button
                    type="button"
                    disabled={isDeleting}
                    className="flex items-center gap-1 text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                }
              />
            )}
          </div>
          {deleteError && <p className="mt-1 text-xs text-destructive">{deleteError}</p>}
        </td>
      )}
    </tr>
  );
}

/**
 * Ordem ("sort_order") nunca é editável diretamente pelo usuário — é
 * sempre recalculada no servidor a partir de min_lifetime_points
 * crescente (ver resequenceLoyaltyTierThresholds), o que torna
 * estruturalmente impossível salvar níveis fora de ordem. A coluna
 * "Ordem" aqui só exibe a posição resultante.
 */
export function LoyaltyTiersSection({
  thresholds,
  usingDefaults,
  canEdit,
}: {
  thresholds: LoyaltyTierThreshold[];
  usingDefaults: boolean;
  canEdit: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const sorted = [...thresholds].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  const canDelete = sorted.filter((t) => t.id).length > 1;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Níveis</h2>
        <p className="text-xs text-muted-foreground">
          O nível do cliente é sempre calculado a partir dos pontos vitalícios ganhos — nunca do
          saldo atual. Resgatar pontos não reduz o nível.
        </p>
      </div>

      {usingDefaults && (
        <p className="rounded-md border border-dashed border-border bg-card/40 p-3 text-xs text-muted-foreground">
          Sua empresa ainda não personalizou os níveis — estes são os valores padrão. Edite e
          salve qualquer um deles para começar a usar níveis próprios.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nível</th>
              <th className="px-4 py-3 font-medium">Pontos mínimos</th>
              <th className="px-4 py-3 font-medium">Ordem</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canEdit && <th className="px-4 py-3 font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((threshold, index) => (
              <TierRow
                key={threshold.id ?? threshold.name}
                threshold={threshold}
                order={index + 1}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canEdit &&
        (isAdding ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <TierEditForm
              threshold={{ name: "", minLifetimePoints: 0 }}
              onCancel={() => setIsAdding(false)}
              onSaved={() => setIsAdding(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            + Adicionar nível
          </button>
        ))}
    </div>
  );
}
