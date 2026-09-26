"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { upsertLoyaltySettingsAction } from "@/lib/loyalty/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { LoyaltySettings } from "@/types/loyalty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

/** Usados quando a empresa ainda não configurou fidelidade — mesmos defaults de public.loyalty_settings, nunca um valor inventado. */
const FALLBACK_SETTINGS: LoyaltySettings = {
  enabled: false,
  pointsPerCurrencyUnit: 1,
  minPurchaseAmountForPoints: 0,
  redemptionValuePerPoint: 0.01,
  minPointsToRedeem: 0,
  maxRedeemPercentPerSale: null,
  pointsExpire: false,
  pointsExpireAfterDays: null,
  birthdayBonusPoints: 0,
  firstPurchaseBonusPoints: 0,
  grantOn: "completion",
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function LoyaltySettingsForm({
  settings,
  canEdit,
}: {
  settings: LoyaltySettings | null;
  canEdit: boolean;
}) {
  const initial = settings ?? FALLBACK_SETTINGS;
  const [state, formAction] = useFormState(upsertLoyaltySettingsAction, initialState);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [pointsExpire, setPointsExpire] = useState(initial.pointsExpire);

  // Só os 3 campos que alimentam a prévia precisam de estado controlado —
  // os demais usam defaultValue (não influenciam o cálculo de exemplo).
  const [pointsPerCurrencyUnit, setPointsPerCurrencyUnit] = useState(
    String(initial.pointsPerCurrencyUnit)
  );
  const [minPurchaseAmountForPoints, setMinPurchaseAmountForPoints] = useState(
    String(initial.minPurchaseAmountForPoints)
  );
  const [redemptionValuePerPoint, setRedemptionValuePerPoint] = useState(
    String(initial.redemptionValuePerPoint)
  );

  const preview = useMemo(() => {
    const rate = Number(pointsPerCurrencyUnit);
    const minAmount = Number(minPurchaseAmountForPoints);
    const value = Number(redemptionValuePerPoint);

    const exampleAmount = 100;
    const pointsEarned =
      Number.isFinite(rate) && Number.isFinite(minAmount) && exampleAmount >= minAmount
        ? Math.floor(exampleAmount * rate)
        : 0;
    const discountFor100Points = Number.isFinite(value) ? 100 * value : 0;

    return { pointsEarned, discountFor100Points };
  }, [pointsPerCurrencyUnit, minPurchaseAmountForPoints, redemptionValuePerPoint]);

  const fieldsetProps = { disabled: !canEdit };

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {!canEdit && (
        <p className="rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          Você pode visualizar as configurações de fidelidade, mas só owner/admin podem alterá-las.
        </p>
      )}

      <FormMessage state={state} />

      <fieldset {...fieldsetProps} className="flex flex-col gap-4 disabled:opacity-60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">1. Programa</h2>
          <FieldHint>Liga ou desliga a fidelidade para toda a empresa.</FieldHint>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            name="enabled"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={!canEdit}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="enabled" className="font-normal">
            Fidelidade ativa para esta empresa
          </Label>
        </div>
      </fieldset>

      <fieldset {...fieldsetProps} className="flex flex-col gap-4 disabled:opacity-60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">2. Acúmulo</h2>
          <FieldHint>Como e quando os clientes ganham pontos.</FieldHint>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pointsPerCurrencyUnit">Pontuação por unidade monetária</Label>
            <Input
              id="pointsPerCurrencyUnit"
              name="pointsPerCurrencyUnit"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={pointsPerCurrencyUnit}
              onChange={(event) => setPointsPerCurrencyUnit(event.target.value)}
              disabled={!canEdit}
            />
            <FieldHint>Quantos pontos o cliente recebe para cada R$1 gasto.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minPurchaseAmountForPoints">Valor mínimo da compra</Label>
            <Input
              id="minPurchaseAmountForPoints"
              name="minPurchaseAmountForPoints"
              type="number"
              min="0"
              step="0.01"
              required
              value={minPurchaseAmountForPoints}
              onChange={(event) => setMinPurchaseAmountForPoints(event.target.value)}
              disabled={!canEdit}
            />
            <FieldHint>Vendas abaixo deste valor não geram pontos. Use 0 para não ter mínimo.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstPurchaseBonusPoints">Bônus de primeira compra</Label>
            <Input
              id="firstPurchaseBonusPoints"
              name="firstPurchaseBonusPoints"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={initial.firstPurchaseBonusPoints}
              disabled={!canEdit}
            />
            <FieldHint>Pontos extras na primeira compra concluída do cliente. Use 0 para não dar bônus.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="birthdayBonusPoints">Bônus de aniversário</Label>
            <Input
              id="birthdayBonusPoints"
              name="birthdayBonusPoints"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={initial.birthdayBonusPoints}
              disabled={!canEdit}
            />
            <FieldHint>Pontos extras numa compra feita no dia do aniversário do cliente (uma vez por ano).</FieldHint>
          </div>
        </div>
      </fieldset>

      <fieldset {...fieldsetProps} className="flex flex-col gap-4 disabled:opacity-60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">3. Resgate</h2>
          <FieldHint>Como os pontos viram desconto numa venda.</FieldHint>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="redemptionValuePerPoint">Valor de cada ponto</Label>
            <Input
              id="redemptionValuePerPoint"
              name="redemptionValuePerPoint"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={redemptionValuePerPoint}
              onChange={(event) => setRedemptionValuePerPoint(event.target.value)}
              disabled={!canEdit}
            />
            <FieldHint>Quanto em reais 1 ponto vale quando o cliente resgata.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minPointsToRedeem">Mínimo de pontos para resgatar</Label>
            <Input
              id="minPointsToRedeem"
              name="minPointsToRedeem"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={initial.minPointsToRedeem}
              disabled={!canEdit}
            />
            <FieldHint>Quantidade mínima de pontos exigida para um resgate. Use 0 para não ter mínimo.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxRedeemPercentPerSale">Percentual máximo por venda</Label>
            <Input
              id="maxRedeemPercentPerSale"
              name="maxRedeemPercentPerSale"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              placeholder="Sem limite"
              defaultValue={initial.maxRedeemPercentPerSale ?? ""}
              disabled={!canEdit}
            />
            <FieldHint>
              Limita o desconto por pontos a até X% do valor da venda. Deixe em branco para não ter limite.
            </FieldHint>
          </div>
        </div>
      </fieldset>

      <fieldset {...fieldsetProps} className="flex flex-col gap-4 disabled:opacity-60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">4. Expiração</h2>
          <FieldHint>Se os pontos ganhos deixam de valer depois de um tempo.</FieldHint>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="pointsExpire"
            name="pointsExpire"
            checked={pointsExpire}
            onChange={(event) => setPointsExpire(event.target.checked)}
            disabled={!canEdit}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="pointsExpire" className="font-normal">
            Pontos expiram com o tempo
          </Label>
        </div>
        {pointsExpire && (
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="pointsExpireAfterDays">Dias até expirar</Label>
            <Input
              id="pointsExpireAfterDays"
              name="pointsExpireAfterDays"
              type="number"
              min="1"
              step="1"
              required={pointsExpire}
              defaultValue={initial.pointsExpireAfterDays ?? 365}
              disabled={!canEdit}
            />
            <FieldHint>Cada lote de pontos ganhos expira este número de dias após a concessão.</FieldHint>
          </div>
        )}
      </fieldset>

      <fieldset {...fieldsetProps} className="flex flex-col gap-4 disabled:opacity-60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">5. Concessão</h2>
          <FieldHint>Em qual momento da venda os pontos são concedidos.</FieldHint>
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="grantOn">Conceder pontos</Label>
          <select
            id="grantOn"
            disabled
            defaultValue="completion"
            className="flex h-10 w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-muted-foreground disabled:cursor-not-allowed"
          >
            <option value="completion">Na conclusão da venda</option>
          </select>
          <FieldHint>
            Conceder somente após o pagamento total ainda não está disponível nesta versão.
          </FieldHint>
        </div>
      </fieldset>

      <div className="rounded-lg border border-dashed border-border bg-card/40 p-4">
        <p className="text-sm font-medium text-foreground">Com as regras atuais:</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          <li>
            Compra de {formatMoney(100)} → <strong className="text-foreground">{preview.pointsEarned} pontos</strong>
          </li>
          <li>
            100 pontos → <strong className="text-foreground">{formatMoney(preview.discountFor100Points)}</strong> de
            desconto
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          As regras exibidas são apenas uma prévia. O cálculo real é validado no servidor.
        </p>
      </div>

      {canEdit && (
        <div>
          <SubmitButton state={state} pendingLabel="Salvando..." className="w-full sm:w-fit">
            Salvar configurações
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
