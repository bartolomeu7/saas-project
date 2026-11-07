"use client";

import { useState, useTransition } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import type { TOTPResource } from "@clerk/nextjs/types";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { describeClerkError } from "@/lib/settings/clerk-errors";

async function copyText(text: string, okMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
  }
}

function downloadCodes(codes: string[]) {
  const blob = new Blob([`Prime Ges - códigos de backup\nCada código vale uma única vez.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "prime-ges-codigos-de-backup.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function BackupCodesBox({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-medium text-foreground">Guarde estes códigos de backup num lugar seguro</p>
      <p className="text-sm text-muted-foreground">
        Se você perder o celular, cada código entra uma única vez no lugar do código do app. Eles não serão mostrados de novo.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-foreground sm:grid-cols-4" aria-label="Códigos de backup">
        {codes.map((code) => (
          <li key={code} className="rounded-md border border-border bg-background/60 px-2 py-1.5 text-center">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyText(codes.join("\n"), "Códigos copiados.")}>
          <Copy aria-hidden="true" />
          Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadCodes(codes)}>
          <Download aria-hidden="true" />
          Baixar .txt
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          Já guardei
        </Button>
      </div>
    </div>
  );
}

/**
 * Verificação em duas etapas por aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy…).
 * Ativar: gera o segredo, mostra o QR e o link para abrir o app, confere o primeiro código e então mostra os códigos de
 * backup uma única vez. O segredo nunca passa pelo nosso servidor: vem do Clerk e fica só nesta tela até confirmar.
 */
export function TwoFactorPanel() {
  const { isLoaded, user } = useUser();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<TOTPResource | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const createTotp = useReverification(() => user?.createTOTP());
  const disableTotp = useReverification(() => user?.disableTOTP());
  const createBackup = useReverification(() => user?.createBackupCode());

  if (!isLoaded || !user) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted/40" aria-busy="true" aria-label="Carregando" />;
  }

  const currentUser = user;
  const enabled = currentUser.totpEnabled;

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const totp = await createTotp();
        if (!totp) {
          setError("Confirmação cancelada. Nada foi alterado.");
          return;
        }
        setSetup(totp);
        setCode("");
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const typed = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(typed)) {
      setError("Digite os 6 números que aparecem no aplicativo.");
      return;
    }
    startTransition(async () => {
      try {
        await currentUser.verifyTOTP({ code: typed });
        setSetup(null);
        setCode("");
        await currentUser.reload();
        toast.success("Verificação em duas etapas ativada.");
        try {
          const backup = await createBackup();
          if (backup?.codes?.length) setBackupCodes(backup.codes);
        } catch {
          // Códigos de backup indisponíveis nesta conta: a verificação em duas etapas já está ativa.
        }
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function regenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const backup = await createBackup();
        if (!backup) {
          setError("Confirmação cancelada. Nada foi alterado.");
          return;
        }
        setBackupCodes(backup.codes);
        await currentUser.reload();
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      try {
        await disableTotp();
        await currentUser.reload();
        setBackupCodes(null);
        toast.success("Verificação em duas etapas desativada.");
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Aplicativo autenticador</p>
          <p className="text-sm text-muted-foreground">
            {enabled ? "Ao entrar, além da senha, pedimos o código do aplicativo." : "Proteja a conta mesmo se a senha vazar."}
          </p>
        </div>
        <Badge variant={enabled ? "success" : "muted"}>{enabled ? "Ativada" : "Desativada"}</Badge>
      </div>

      {!enabled && !setup && (
        <div>
          <Button type="button" onClick={start} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
            Ativar com Google Authenticator
          </Button>
        </div>
      )}

      {setup && (
        <form onSubmit={confirm} className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4" noValidate>
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-foreground">
            <li>
              Abra o <strong>Google Authenticator</strong> (ou outro app autenticador) e adicione uma conta.
              <div className="mt-3 flex flex-wrap items-start gap-4">
                {setup.uri && (
                  <div className="rounded-lg bg-white p-2" aria-label="QR code para o aplicativo autenticador" role="img">
                    <QRCodeSVG value={setup.uri} size={168} marginSize={1} />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {setup.uri && (
                    <a
                      href={setup.uri}
                      className="inline-flex w-fit items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      Abrir no app autenticador (celular)
                    </a>
                  )}
                  {setup.secret && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Ou digite esta chave no app:</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs text-foreground">{setup.secret}</code>
                        <Button type="button" size="xs" variant="outline" onClick={() => void copyText(setup.secret ?? "", "Chave copiada.")}>
                          <Copy aria-hidden="true" />
                          Copiar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
            <li>
              Digite aqui o código de 6 números que o app mostrar:
              <FormField label="Código do aplicativo" hideLabel>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="000000"
                  className="mt-2 max-w-[12rem] tracking-[0.3em]"
                />
              </FormField>
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Confirmar e ativar
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setSetup(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {enabled && !backupCodes && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={regenerate} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Gerar novos códigos de backup
          </Button>
          <ConfirmDialog
            destructive
            title="Desativar a verificação em duas etapas?"
            description="A sua conta ficará protegida só pela senha (ou pela conta social). Você pode ativar de novo quando quiser."
            confirmLabel="Desativar"
            onConfirm={disable}
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={pending} className="text-destructive">
                Desativar
              </Button>
            }
          />
        </div>
      )}

      {backupCodes && <BackupCodesBox codes={backupCodes} onDone={() => setBackupCodes(null)} />}

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
