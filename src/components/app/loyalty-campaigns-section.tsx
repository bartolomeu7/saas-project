"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { Pencil, X } from "lucide-react";
import {
  createLoyaltyCampaignAction,
  updateLoyaltyCampaignAction,
  setLoyaltyCampaignStatusAction,
} from "@/lib/loyalty/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { LoyaltyCampaign } from "@/types/loyalty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const initialState: ActionResult = {};

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function scopeLabel(campaign: LoyaltyCampaign): string {
  if (campaign.targetType === "product") return `Produto: ${campaign.targetName} — EM BREVE`;
  if (campaign.targetType === "service") return `Serviço: ${campaign.targetName} — EM BREVE`;
  return "Venda inteira";
}

function CampaignForm({
  campaign,
  onCancel,
  onSaved,
}: {
  campaign?: LoyaltyCampaign;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const action = campaign
    ? updateLoyaltyCampaignAction.bind(null, campaign.id)
    : createLoyaltyCampaignAction;
  const [state, formAction] = useFormState(action, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="campaign-name">Nome</Label>
          <Input
            id="campaign-name"
            name="name"
            defaultValue={campaign?.name}
            maxLength={100}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="campaign-description">Descrição (opcional)</Label>
          <textarea
            id="campaign-description"
            name="description"
            defaultValue={campaign?.description ?? ""}
            maxLength={500}
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-multiplier">Multiplicador (opcional)</Label>
          <Input
            id="campaign-multiplier"
            name="multiplier"
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="Ex: 2"
            defaultValue={campaign?.multiplier ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-bonus">Bônus em pontos (opcional)</Label>
          <Input
            id="campaign-bonus"
            name="bonusPoints"
            type="number"
            min="0"
            step="1"
            placeholder="Ex: 50"
            defaultValue={campaign?.bonusPoints ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-starts">Data inicial</Label>
          <Input
            id="campaign-starts"
            name="startsAt"
            type="date"
            defaultValue={campaign ? toDateInputValue(campaign.startsAt) : undefined}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-ends">Data final</Label>
          <Input
            id="campaign-ends"
            name="endsAt"
            type="date"
            defaultValue={campaign ? toDateInputValue(campaign.endsAt) : undefined}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-status">Status</Label>
          <select
            id="campaign-status"
            name="status"
            defaultValue={campaign?.status ?? "active"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Informe um multiplicador, um bônus em pontos, ou ambos. Escopo nesta versão: venda
        inteira — campanhas por produto ou serviço ainda não estão disponíveis.
      </p>

      <div className="flex items-center gap-2">
        <SubmitButton state={state} pendingLabel="Salvando..." size="sm" className="w-auto">
          Salvar
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Cancelar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function CampaignRow({ campaign, canEdit }: { campaign: LoyaltyCampaign; canEdit: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isToggling, startToggling] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const isActive = campaign.status === "active";

  const toggleQuestion = isActive
    ? "Vendas concluídas a partir de agora deixam de considerar esta campanha."
    : "A campanha volta a valer para as vendas concluídas.";

  function handleToggleStatus() {
    const nextStatus = isActive ? "inactive" : "active";
    setToggleError(null);
    startToggling(async () => {
      const result = await setLoyaltyCampaignStatusAction(campaign.id, nextStatus);
      if (result.error) setToggleError(result.error);
    });
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="bg-secondary/30 px-4 py-3">
          <CampaignForm
            campaign={campaign}
            onCancel={() => setIsEditing(false)}
            onSaved={() => setIsEditing(false)}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="px-4 py-3 font-medium text-foreground">{campaign.name}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}
      </TableCell>
      <TableCell className="px-4 py-3 text-foreground">
        {campaign.multiplier === null ? "—" : `${campaign.multiplier}x`}
      </TableCell>
      <TableCell className="px-4 py-3 text-foreground">{campaign.bonusPoints ?? "—"}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{scopeLabel(campaign)}</TableCell>
      <TableCell className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isActive ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"
          }`}
        >
          {isActive ? "Ativa" : "Inativa"}
        </span>
      </TableCell>
      {canEdit && (
        <TableCell className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <ConfirmDialog
              title={`${isActive ? "Desativar" : "Ativar"} a campanha "${campaign.name}"?`}
              description={toggleQuestion}
              confirmLabel={isActive ? "Desativar" : "Ativar"}
              destructive={isActive}
              onConfirm={handleToggleStatus}
              trigger={
                <button
                  type="button"
                  disabled={isToggling}
                  className="flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                >
                  {isActive ? "Desativar" : "Ativar"}
                </button>
              }
            />
          </div>
          {toggleError && <p className="mt-1 text-xs text-destructive">{toggleError}</p>}
        </TableCell>
      )}
    </TableRow>
  );
}

export function LoyaltyCampaignsSection({
  campaigns,
  canEdit,
}: {
  campaigns: LoyaltyCampaign[];
  canEdit: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Campanhas</h2>
        <p className="text-xs text-muted-foreground">
          Campanhas alteram as regras de pontuação somente para novas vendas dentro do período
          configurado. Campanhas por produto ou serviço ainda não estão disponíveis nesta versão.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha configurada ainda."
          description="Crie uma campanha para conceder multiplicador e/ou bônus de pontos por tempo limitado."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="w-full min-w-[760px] text-sm">
            <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Período</TableHead>
                <TableHead className="px-4 py-3 font-medium">Multiplicador</TableHead>
                <TableHead className="px-4 py-3 font-medium">Bônus</TableHead>
                <TableHead className="px-4 py-3 font-medium">Escopo</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                {canEdit && <TableHead className="px-4 py-3 font-medium">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} canEdit={canEdit} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canEdit &&
        (isAdding ? (
          <CampaignForm onCancel={() => setIsAdding(false)} onSaved={() => setIsAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            + Nova campanha
          </button>
        ))}
    </div>
  );
}
