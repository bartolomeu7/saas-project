"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useReverification, useUser } from "@clerk/nextjs";
import type { EmailAddressResource } from "@clerk/nextjs/types";
import { Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { describeClerkError } from "@/lib/settings/clerk-errors";
import { syncProfileFromClerkAction } from "@/lib/settings/actions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * E-mails da conta: ver, adicionar (com código de confirmação), escolher o principal e remover.
 * Trocar o e-mail = adicionar o novo, confirmar o código, torná-lo principal e (se quiser) remover o antigo.
 * O e-mail principal é o do login e o que a equipe usa para convidar a pessoa; por isso o perfil interno é atualizado
 * junto (syncProfileFromClerkAction), sempre a partir do dado verificado no servidor.
 */
export function EmailAddressesPanel() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  // e-mail que está aguardando o código de confirmação
  const [verifying, setVerifying] = useState<EmailAddressResource | null>(null);
  const [code, setCode] = useState("");

  const createEmail = useReverification((email: string) => user?.createEmailAddress({ email }));
  const removeEmail = useReverification((address: EmailAddressResource) => address.destroy());

  if (!isLoaded || !user) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted/40" aria-busy="true" aria-label="Carregando e-mails" />;
  }

  const currentUser = user;
  const primaryId = currentUser.primaryEmailAddressId;

  async function afterChange(message: string) {
    await currentUser.reload();
    const result = await syncProfileFromClerkAction();
    if (result.error) toast.warning(result.error);
    toast.success(message);
    router.refresh();
  }

  function sendCode(address: EmailAddressResource) {
    setError(null);
    startTransition(async () => {
      try {
        await address.prepareVerification({ strategy: "email_code" });
        setVerifying(address);
        setCode("");
        toast.success(`Enviamos um código para ${address.emailAddress}.`);
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function addEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createEmail(email);
        if (!created) {
          setError("Confirmação cancelada. Nada foi alterado.");
          return;
        }
        await currentUser.reload();
        const address = currentUser.emailAddresses.find((item) => item.id === created.id);
        if (!address) {
          setError("Não foi possível adicionar o e-mail agora. Tente novamente.");
          return;
        }
        setAdding(false);
        setNewEmail("");
        await address.prepareVerification({ strategy: "email_code" });
        setVerifying(address);
        setCode("");
        toast.success(`Enviamos um código para ${address.emailAddress}.`);
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
      setError("Digite o código que chegou no e-mail.");
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
        await afterChange("E-mail confirmado.");
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function makePrimary(address: EmailAddressResource) {
    setError(null);
    startTransition(async () => {
      try {
        await currentUser.update({ primaryEmailAddressId: address.id });
        await afterChange("E-mail principal atualizado. Use-o no próximo login.");
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function remove(address: EmailAddressResource) {
    setError(null);
    startTransition(async () => {
      try {
        await removeEmail(address);
        if (verifying?.id === address.id) setVerifying(null);
        await afterChange("E-mail removido.");
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {currentUser.emailAddresses.map((address) => {
          const isPrimary = address.id === primaryId;
          const verified = address.verification?.status === "verified";
          return (
            <li key={address.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-all text-sm font-medium text-foreground">{address.emailAddress}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {isPrimary && <Badge variant="info">Principal</Badge>}
                <Badge variant={verified ? "success" : "warning"}>{verified ? "Confirmado" : "Não confirmado"}</Badge>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {!verified && (
                  <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => sendCode(address)}>
                    Confirmar
                  </Button>
                )}
                {verified && !isPrimary && (
                  <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => makePrimary(address)}>
                    Tornar principal
                  </Button>
                )}
                {!isPrimary && (
                  <ConfirmDialog
                    destructive
                    title="Remover este e-mail?"
                    description={`${address.emailAddress} deixará de estar ligado à sua conta.`}
                    confirmLabel="Remover"
                    onConfirm={() => remove(address)}
                    trigger={
                      <Button type="button" size="xs" variant="ghost" disabled={pending} aria-label={`Remover ${address.emailAddress}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {verifying && (
        <form onSubmit={confirmCode} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" noValidate>
          <p className="text-sm text-foreground">
            Digite o código enviado para <strong className="break-all">{verifying.emailAddress}</strong>.
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
              Confirmar e-mail
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
        <form onSubmit={addEmail} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <FormField label="Novo e-mail" className="flex-1">
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" placeholder="voce@exemplo.com" />
          </FormField>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Adicionar
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
            Adicionar ou trocar e-mail
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Para trocar o e-mail: adicione o novo, confirme o código, toque em “Tornar principal” e, se quiser, remova o antigo.
      </p>

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
