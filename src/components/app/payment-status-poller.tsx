"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPaymentStatusAction, checkPaymentNowAction } from "@/lib/billing/actions";
import { SUBSCRIPTION_PAYMENT_STATUS_LABELS } from "@/types/billing";
import type { SubscriptionPaymentStatus } from "@/types/billing";

/** A cada 7s, por até ~10 minutos — depois disso o usuário ainda pode clicar em "Já paguei" manualmente. */
const POLL_INTERVAL_MS = 7000;
const MAX_POLLS = 85;

const TERMINAL_STATUSES: SubscriptionPaymentStatus[] = [
  "paid",
  "expired",
  "cancelled",
  "failed",
  "refunded",
];

const CARD_FAILED_MESSAGE = "O pagamento no cartão não foi aprovado. Tente outro cartão ou use o Pix.";

const STILL_PENDING_MESSAGE =
  "Verificamos agora e o pagamento continua pendente. Se você ainda não pagou, pague o Pix acima para liberar o acesso. Se já pagou, aguarde alguns instantes: a liberação é automática.";

const FRIENDLY_MESSAGES: Partial<Record<SubscriptionPaymentStatus, string>> = {
  paid: "Pagamento confirmado! Sua assinatura já está ativa.",
  expired: "Este Pix expirou. Gere um novo pagamento para continuar.",
  cancelled: "Esta cobrança foi cancelada.",
  failed: "Não foi possível confirmar o pagamento. Tente novamente ou fale com o suporte.",
};

export function PaymentStatusPoller({
  paymentId,
  initialStatus,
  method = "pix",
}: {
  paymentId: string;
  initialStatus: SubscriptionPaymentStatus;
  method?: "pix" | "card";
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkedPending, setCheckedPending] = useState(false);
  const pollCountRef = useRef(0);

  const isTerminal = TERMINAL_STATUSES.includes(status);

  useEffect(() => {
    if (isTerminal) return;

    const interval = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        clearInterval(interval);
        return;
      }

      const result = await getPaymentStatusAction(paymentId);
      if (result.status && result.status !== status) {
        setStatus(result.status);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminal, paymentId]);

  async function handleCheckNow() {
    setChecking(true);
    setErrorMessage(null);
    setCheckedPending(false);

    const result = await checkPaymentNowAction(paymentId);
    setChecking(false);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }
    if (result.status) {
      setCheckedPending(result.status === "pending");
      setStatus(result.status);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {SUBSCRIPTION_PAYMENT_STATUS_LABELS[status]}
      </p>

      {(method === "card" && status === "failed" ? CARD_FAILED_MESSAGE : FRIENDLY_MESSAGES[status]) && (
        <p
          className={
            status === "paid"
              ? "text-sm font-medium text-success"
              : "text-sm text-destructive"
          }
        >
          {method === "card" && status === "failed" ? CARD_FAILED_MESSAGE : FRIENDLY_MESSAGES[status]}
        </p>
      )}

      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}

      {/* A região fica sempre montada para o leitor de tela anunciar o resultado da consulta. */}
      <p role="status" className="text-sm text-foreground empty:sr-only">
        {checkedPending && status === "pending" ? STILL_PENDING_MESSAGE : null}
      </p>

      {!isTerminal && method === "pix" && (
        <Button onClick={handleCheckNow} disabled={checking} className="w-full">
          {checking ? "Consultando..." : "Já paguei"}
        </Button>
      )}
    </div>
  );
}
