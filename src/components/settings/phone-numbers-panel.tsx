"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useReverification, useUser } from "@clerk/nextjs";
import type { PhoneNumberResource } from "@clerk/nextjs/types";
import { Loader2, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { describeClerkError } from "@/lib/settings/clerk-errors";
import { formatPhoneDisplay, normalizePhoneInput } from "@/lib/settings/phone";

/** Telefone da conta: cadastrar (com código por SMS), trocar e remover. Aceita o número brasileiro sem o +55. */
export function PhoneNumbersPanel() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [verifying, setVerifying] = useState<PhoneNumberResource | null>(null);
  const [code, setCode] = useState("");

  const createPhone = useReverification((phoneNumber: string) => user?.createPhoneNumber({ phoneNumber }));
  const removePhone = useReverification((phone: PhoneNumberResource) => phone.destroy());

  if (!isLoaded || !user) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted/40" aria-busy="true" aria-label="Carregando telefone" />;
  }

  const currentUser = user;

  function sendCode(phone: PhoneNumberResource) {
    setError(null);
    startTransition(async () => {
      try {
        await phone.prepareVerification();
        setVerifying(phone);
        setCode("");
        toast.success(`Enviamos um código por SMS para ${formatPhoneDisplay(phone.phoneNumber)}.`);
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function addPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const e164 = normalizePhoneInput(number);
    if (!e164) {
      setError("Informe o telefone com DDD. Ex.: (11) 99999-8888.");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createPhone(e164);
        if (!created) {
          setError("Confirmação cancelada. Nada foi alterado.");
          return;
        }
        await currentUser.reload();
        const phone = currentUser.phoneNumbers.find((item) => item.id === created.id);
        if (!phone) {
          setError("Não foi possível adicionar o telefone agora. Tente novamente.");
          return;
        }
        setAdding(false);
        setNumber("");
        await phone.prepareVerification();
        setVerifying(phone);
        setCode("");
        toast.success(`Enviamos um código por SMS para ${formatPhoneDisplay(phone.phoneNumber)}.`);
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function confirmCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verifying) return;
    setError(null);
    const typed = code.replace(/\s/g, "");
    if (typed.length < 4) {
      setError("Digite o código que chegou por SMS.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await verifying.attemptVerification({ code: typed });
        if (result.verification.status !== "verified") {
          setError("Não foi possível confirmar o código. Peça um novo.");
          return;
        }
        setVerifying(null);
        setCode("");
        await currentUser.reload();
        toast.success("Telefone confirmado.");
        router.refresh();
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function remove(phone: PhoneNumberResource) {
    setError(null);
    startTransition(async () => {
      try {
        await removePhone(phone);
        if (verifying?.id === phone.id) setVerifying(null);
        await currentUser.reload();
        toast.success("Telefone removido.");
        router.refresh();
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {currentUser.phoneNumbers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Nenhum telefone cadastrado.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {currentUser.phoneNumbers.map((phone) => {
            const verified = phone.verification?.status === "verified";
            return (
              <li key={phone.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{formatPhoneDisplay(phone.phoneNumber)}</span>
                <Badge variant={verified ? "success" : "warning"}>{verified ? "Confirmado" : "Não confirmado"}</Badge>
                <span className="flex items-center gap-1.5">
                  {!verified && (
                    <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => sendCode(phone)}>
                      Confirmar
                    </Button>
                  )}
                  <ConfirmDialog
                    destructive
                    title="Remover este telefone?"
                    description={`${formatPhoneDisplay(phone.phoneNumber)} deixará de estar ligado à sua conta.`}
                    confirmLabel="Remover"
                    onConfirm={() => remove(phone)}
                    trigger={
                      <Button type="button" size="xs" variant="ghost" disabled={pending} aria-label={`Remover ${formatPhoneDisplay(phone.phoneNumber)}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {verifying && (
        <form onSubmit={confirmCode} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" noValidate>
          <p className="text-sm text-foreground">
            Digite o código enviado por SMS para <strong>{formatPhoneDisplay(verifying.phoneNumber)}</strong>.
          </p>
          <FormField label="Código de confirmação">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              className="max-w-[12rem] tracking-[0.3em]"
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Confirmar telefone
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => sendCode(verifying)}>
              Reenviar código
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setVerifying(null)}>
              Agora não
            </Button>
          </div>
        </form>
      )}

      {adding ? (
        <form onSubmit={addPhone} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <FormField label="Telefone com DDD" hint="Ex.: (11) 99999-8888. Para outro país, comece com + e o código do país." className="flex-1">
            <Input type="tel" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="(11) 99999-8888" />
          </FormField>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Enviar código
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {currentUser.phoneNumbers.length === 0 ? "Cadastrar telefone" : "Adicionar ou trocar telefone"}
          </Button>
        </div>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
