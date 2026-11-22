"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBillingProfileAction } from "@/lib/billing/actions";

type Method = "pix" | "card";

/**
 * Checkout da assinatura: mostra o que falta do cadastro da empresa (CPF/CNPJ e telefone, exigidos pela SyncPay), salva no
 * cadastro e segue direto para a cobrança. O preço NÃO trafega daqui: a rota lê o preço do plano no banco.
 */
export function CheckoutForm({
  planId,
  cardEnabled,
  initialMethod,
  needsDocument,
  needsPhone,
  defaultDocument,
  defaultPhone,
}: {
  planId: string;
  cardEnabled: boolean;
  initialMethod: Method;
  needsDocument: boolean;
  needsPhone: boolean;
  defaultDocument: string;
  defaultPhone: string;
}) {
  const router = useRouter();
  const [document, setDocument] = useState(defaultDocument);
  const [phone, setPhone] = useState(defaultPhone);
  const [errors, setErrors] = useState<{ document?: string; phone?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);

  async function pay(method: Method) {
    setMessage(null);
    setErrors({});
    setBusy(method);
    try {
      // 1) salva no cadastro o que faltava (só os campos mostrados)
      if (needsDocument || needsPhone) {
        const saved = await saveBillingProfileAction({
          ...(needsDocument ? { document } : {}),
          ...(needsPhone ? { phone } : {}),
        });
        if (!saved.ok) {
          setErrors(saved.errors ?? {});
          setMessage(saved.error ?? null);
          setBusy(null);
          return;
        }
      }

      // 2) cria a cobrança (Pix) ou a reserva (cartão) e vai para a tela de pagamento
      const response = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, method }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; paymentId?: string };
      if (!response.ok || !data.paymentId) {
        setMessage(data.error ?? "Não foi possível iniciar o pagamento. Tente novamente.");
        setBusy(null);
        return;
      }
      router.push(`/app/assinatura/pagamento/${data.paymentId}`);
    } catch {
      setMessage("Erro de conexão. Tente novamente.");
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void pay(initialMethod);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {(needsDocument || needsPhone) && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Dados para o pagamento</p>
            <p className="text-xs text-muted-foreground">
              O pagamento exige CPF/CNPJ e telefone. Eles ficam salvos no cadastro da sua empresa e você não precisa informar de novo.
            </p>
          </div>

          {needsDocument && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-document">CPF ou CNPJ</Label>
              <Input
                id="checkout-document"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                aria-invalid={errors.document ? true : undefined}
                aria-describedby={errors.document ? "checkout-document-error" : undefined}
                disabled={disabled}
              />
              {errors.document && (
                <p id="checkout-document-error" className="text-xs text-destructive">
                  {errors.document}
                </p>
              )}
            </div>
          )}

          {needsPhone && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-phone">Telefone com DDD</Label>
              <Input
                id="checkout-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 99999-8888"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? "checkout-phone-error" : undefined}
                disabled={disabled}
              />
              {errors.phone && (
                <p id="checkout-phone-error" className="text-xs text-destructive">
                  {errors.phone}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {message && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {initialMethod === "pix" ? (
          <>
            <Button type="submit" disabled={disabled}>
              {busy === "pix" ? "Gerando Pix..." : "Gerar Pix para pagar"}
            </Button>
            {cardEnabled && (
              <Button type="button" variant="outline" disabled={disabled} onClick={() => void pay("card")}>
                {busy === "card" ? "Preparando..." : "Pagar com cartão"}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button type="submit" disabled={disabled}>
              {busy === "card" ? "Preparando..." : "Continuar para o cartão"}
            </Button>
            <Button type="button" variant="outline" disabled={disabled} onClick={() => void pay("pix")}>
              {busy === "pix" ? "Gerando Pix..." : "Prefiro pagar com Pix"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
