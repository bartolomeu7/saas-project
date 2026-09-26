"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { redeemLoyaltyPointsAction, removeLoyaltyRedemptionFromDraftAction } from "@/lib/loyalty/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { LoyaltyAccount, LoyaltySettings } from "@/types/loyalty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { ConfirmDialog } from "@/components/app/confirm-dialog";

const initialState: ActionResult = {};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPoints(value: number): string {
  return value.toLocaleString("pt-BR");
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Fidelidade</h2>
      {children}
    </div>
  );
}

/**
 * Cliente já resgatou pontos nesta venda — mostra o valor real gravado no
 * servidor (nunca um número que a UI calculou) e a ação de remover. O
 * formulário de resgate fica escondido enquanto houver um resgate ativo:
 * esta versão trata resgate como um toggle (aplicar OU remover), não como
 * um acúmulo incremental na mesma tela — mesmo que redeem_loyalty_points
 * no banco suporte chamadas repetidas.
 */
function ActiveRedemption({
  saleId,
  pointsRedeemed,
  discountAmount,
}: {
  saleId: string;
  pointsRedeemed: number;
  discountAmount: number;
}) {
  const [isRemoving, startRemoving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    setError(null);
    startRemoving(async () => {
      const result = await removeLoyaltyRedemptionFromDraftAction(saleId);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          {formatPoints(pointsRedeemed)} pontos utilizados — desconto de {formatMoney(discountAmount)}
        </div>
        <ConfirmDialog
          title="Remover o uso de pontos desta venda?"
          description="Os pontos voltam para o saldo do cliente."
          confirmLabel="Remover"
          destructive
          onConfirm={handleRemove}
          trigger={
            <button
              type="button"
              disabled={isRemoving}
              className="w-fit text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
            >
              {isRemoving ? "Removendo..." : "Remover uso de pontos"}
            </button>
          }
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </Card>
  );
}

/** Cliente sem saldo positivo — nunca oferece o formulário de resgate (nem no client, nem confiando só nisso: o servidor rejeita de qualquer forma). */
function NoBalance({ balance }: { balance: number }) {
  if (balance < 0) {
    return (
      <Card>
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <p className="font-medium">Saldo de pontos negativo</p>
          <p className="mt-0.5 text-xs">
            Os pontos serão recuperados conforme novos pontos forem ganhos.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm text-muted-foreground">
        Este cliente ainda não tem pontos disponíveis para resgate.
      </p>
    </Card>
  );
}

/** Formulário de resgate — só renderizado quando balance > 0 e não há resgate ativo. */
function RedeemForm({
  saleId,
  settings,
  balance,
}: {
  saleId: string;
  settings: LoyaltySettings;
  balance: number;
}) {
  const action = redeemLoyaltyPointsAction.bind(null, saleId);
  const [state, formAction] = useFormState(action, initialState);
  const [pointsInput, setPointsInput] = useState("");

  const trimmed = pointsInput.trim();
  const parsed = Number(trimmed);
  const isInteger = trimmed !== "" && Number.isInteger(parsed);
  const min = settings.minPointsToRedeem > 0 ? settings.minPointsToRedeem : 1;

  // Validação de cliente é só UX (mensagem imediata, sem round-trip) — a
  // fonte de verdade continua sendo public.redeem_loyalty_points, chamada
  // por redeemLoyaltyPointsAction, que reconfere saldo/mínimo/percentual
  // com os dados reais no momento do envio (nunca confia neste `balance`,
  // que pode já estar desatualizado quando o usuário clica em enviar).
  let clientError: string | null = null;
  if (trimmed !== "") {
    if (!isInteger) {
      clientError = "Informe um número inteiro de pontos.";
    } else if (parsed <= 0) {
      clientError = "Informe uma quantidade maior que zero.";
    } else if (parsed < min) {
      clientError = `A quantidade mínima para resgate é ${formatPoints(min)} pontos.`;
    } else if (parsed > balance) {
      clientError = `Você não pode usar mais pontos do que o saldo disponível (${formatPoints(balance)}).`;
    }
  }

  const canSubmit = isInteger && parsed > 0 && !clientError;
  const previewValue = canSubmit ? parsed * settings.redemptionValuePerPoint : null;

  return (
    <Card>
      <dl className="mb-4 flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Saldo disponível</dt>
          <dd className="font-medium text-foreground">{formatPoints(balance)} pontos</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Valor disponível</dt>
          <dd className="text-foreground">{formatMoney(balance * settings.redemptionValuePerPoint)}</dd>
        </div>
      </dl>

      <form action={formAction} className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loyalty-points">Pontos a utilizar</Label>
          <Input
            id="loyalty-points"
            name="points"
            type="number"
            step="1"
            min={min}
            max={balance}
            required
            value={pointsInput}
            onChange={(event) => setPointsInput(event.target.value)}
            className="w-32"
          />
        </div>

        {clientError && <p className="text-xs text-destructive">{clientError}</p>}

        {previewValue !== null && !clientError && (
          <p className="text-xs text-muted-foreground">
            {formatPoints(parsed)} pontos → {formatMoney(previewValue)}
            <br />
            Esse valor é uma prévia — o servidor calcula e valida o valor real do desconto.
          </p>
        )}

        {/* Sem `disabled` aqui de propósito: SubmitButton espalha {...props}
            depois de `disabled={pending}` internamente, então passar
            disabled={!canSubmit} sobrescreveria a trava de duplo clique
            assim que canSubmit voltasse a ser true (o valor não muda
            durante o pending). A validação de entrada fica só nos
            atributos nativos do input (required/min/max/step) + na
            mensagem de erro abaixo — o servidor é quem decide de verdade. */}
        <SubmitButton state={state} pendingLabel="Aplicando..." size="sm" className="w-fit">
          Usar pontos
        </SubmitButton>
        <FormMessage state={state} />
      </form>
    </Card>
  );
}

/**
 * Card "Fidelidade" da Nova Venda. O chamador (SaleDetailPage) só renderiza
 * este componente quando a venda está em draft, tem cliente selecionado e
 * loyalty_settings.enabled é true — as três condições que decidem SE o
 * card aparece; aqui dentro só resta decidir qual dos 3 estados mostrar
 * (resgate ativo / sem saldo / formulário), a partir de dados que já
 * vieram prontos do servidor (settings/account), sem nenhuma query nova
 * do lado do cliente.
 */
export function UseLoyaltyPointsCard({
  saleId,
  settings,
  account,
  loyaltyPointsRedeemed,
  loyaltyDiscountAmount,
}: {
  saleId: string;
  settings: LoyaltySettings;
  account: LoyaltyAccount;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
}) {
  if (loyaltyPointsRedeemed > 0) {
    return (
      <ActiveRedemption
        saleId={saleId}
        pointsRedeemed={loyaltyPointsRedeemed}
        discountAmount={loyaltyDiscountAmount}
      />
    );
  }

  if (account.balance <= 0) {
    return <NoBalance balance={account.balance} />;
  }

  return <RedeemForm saleId={saleId} settings={settings} balance={account.balance} />;
}
