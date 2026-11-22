"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Origem do formulário de cartão da SyncPay: só mensagens deste iFrame são aceitas. */
const SYNCPAY_ORIGIN = "https://app.syncpayments.com.br";

type Phase = "form" | "sending" | "processing";

const IFRAME_ERRORS: Record<string, string> = {
  tokenize_failed: "Não foi possível validar o cartão. Confira os dados e tente novamente.",
  config_unavailable: "O formulário de cartão não carregou. Tente novamente em instantes ou use o Pix.",
};

/**
 * Formulário de cartão da SyncPay (iFrame). Os dados do cartão são digitados DENTRO do iFrame e nunca passam por esta
 * página nem pelo nosso servidor: o iFrame só devolve um token de uso único (postMessage), que enviamos ao servidor junto com
 * o id do pagamento. O VALOR não trafega do navegador (a URL do iFrame é montada no servidor a partir do pagamento salvo).
 * O token NÃO prova pagamento: quem confirma é o webhook assinado; esta tela só mostra "processando".
 */
export function CardCheckout({ paymentId, iframeUrl, alreadySubmitted }: { paymentId: string; iframeUrl: string; alreadySubmitted: boolean }) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sendingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>(alreadySubmitted ? "processing" : "form");
  const [message, setMessage] = useState<string | null>(null);
  const [height, setHeight] = useState(440);
  // incrementar a chave recarrega o iFrame (um token novo por tentativa)
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (phase !== "form") return;

    async function submit(token: string) {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setPhase("sending");
      setMessage(null);
      try {
        const response = await fetch("/api/billing/pay-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId, token }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };

        if (response.ok || response.status === 202 || data.code === "PAYMENT_IN_PROGRESS") {
          if (data.error) setMessage(data.error);
          setPhase("processing");
          router.refresh();
          return;
        }
        // recusa definitiva: o comprador pode tentar de novo com outro cartão (token novo)
        setMessage(data.error ?? "Não foi possível processar o pagamento. Tente novamente.");
        setPhase("form");
        setAttempt((n) => n + 1);
      } catch {
        setMessage("Erro de conexão. Confira se o pagamento foi iniciado antes de tentar de novo.");
        setPhase("processing");
      } finally {
        sendingRef.current = false;
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== SYNCPAY_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; method?: string; token?: unknown; height?: unknown; code?: unknown } | null;
      if (!data || data.source !== "syncpay-embed") return;

      if (data.type === "resize" && typeof data.height === "number" && data.height >= 200 && data.height <= 1000) {
        setHeight(Math.round(data.height));
      } else if (data.type === "token" && data.method === "card" && typeof data.token === "string") {
        void submit(data.token);
      } else if (data.type === "error" && typeof data.code === "string") {
        setMessage(IFRAME_ERRORS[data.code] ?? "Não foi possível usar o cartão agora. Tente novamente.");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [phase, paymentId, router]);

  if (phase === "processing") {
    return (
      <div className="w-full rounded-md border border-border bg-secondary px-4 py-3 text-left text-sm text-foreground" role="status">
        <p className="font-medium">Estamos processando o seu pagamento…</p>
        <p className="mt-1 text-muted-foreground">A confirmação do banco chega em instantes e esta tela atualiza sozinha. Não feche nem pague de novo.</p>
        {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {message && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      {phase === "sending" && <p className="text-sm text-muted-foreground">Enviando o pagamento…</p>}
      <iframe
        key={attempt}
        ref={iframeRef}
        title="Pagamento com cartão"
        src={iframeUrl}
        allow="payment"
        style={{ width: "100%", height, border: 0, opacity: phase === "sending" ? 0.5 : 1 }}
      />
      <p className="text-xs text-muted-foreground">Os dados do cartão são digitados no ambiente seguro da SyncPay e não passam pelos servidores do Prime Ges.</p>
    </div>
  );
}
