"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import {
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  startTwoFactorSetupAction,
  type TwoFactorActionState,
} from "@/lib/security/two-factor/actions";

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

const initialState: TwoFactorActionState = {};

/** Pede um código (app ou backup) para confirmar uma ação sensível: desativar ou gerar novos códigos. */
function CodeConfirmForm({
  action,
  label,
  submitLabel,
  pendingLabel,
  destructive,
  onCancel,
  onSuccess,
}: {
  action: (prev: TwoFactorActionState, formData: FormData) => Promise<TwoFactorActionState>;
  label: string;
  submitLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onSuccess: (state: TwoFactorActionState) => void;
}) {
  const [state, formAction] = useFormState(
    async (prev: TwoFactorActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.success) onSuccess(result);
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4" noValidate>
      <FormField label={label}>
        <Input name="code" autoFocus autoComplete="one-time-code" inputMode="text" autoCapitalize="characters" spellCheck={false} maxLength={20} required className="max-w-[14rem] tracking-[0.2em]" />
      </FormField>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton state={state} pendingLabel={pendingLabel} variant={destructive ? "destructive" : "default"} className="w-auto">
          {submitLabel}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

type Mode = "idle" | "setup" | "disable" | "regenerate";

/**
 * Verificação em duas etapas PRÓPRIA do Prime Ges (aplicativo autenticador: Google Authenticator, Microsoft Authenticator,
 * Authy…). O segredo é gerado e guardado cifrado no servidor; esta tela só o mostra uma vez, na ativação. Desativar e
 * gerar novos códigos de backup exigem um código válido.
 */
export function TwoFactorPanel({
  enabled,
  configured,
  backupCodesRemaining,
}: {
  enabled: boolean;
  /** A chave de cifra existe neste ambiente. Sem ela não dá para ativar. */
  configured: boolean;
  backupCodesRemaining: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const [confirmState, confirmAction] = useFormState(
    async (prev: TwoFactorActionState, formData: FormData) => {
      const result = await confirmTwoFactorSetupAction(prev, formData);
      if (result.success) {
        setSetup(null);
        setMode("idle");
        setBackupCodes(result.backupCodes ?? null);
        toast.success(result.success);
        router.refresh();
      }
      return result;
    },
    initialState
  );

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startTwoFactorSetupAction();
      if (result.error || !result.setup) {
        setError(result.error ?? "Não foi possível iniciar agora. Tente novamente.");
        return;
      }
      setSetup(result.setup);
      setMode("setup");
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
            {enabled
              ? `Ao entrar, além do login, pedimos o código do aplicativo. ${backupCodesRemaining} código${backupCodesRemaining === 1 ? "" : "s"} de backup sobrando.`
              : "Proteja a conta mesmo se a senha vazar."}
          </p>
        </div>
        <Badge variant={enabled ? "success" : "muted"}>{enabled ? "Ativada" : "Desativada"}</Badge>
      </div>

      {!enabled && !configured && (
        <Alert>Este recurso ainda está sendo liberado neste ambiente. Volte em breve.</Alert>
      )}

      {!enabled && configured && mode === "idle" && (
        <div>
          <Button type="button" onClick={start} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
            Ativar com Google Authenticator
          </Button>
        </div>
      )}

      {mode === "setup" && setup && (
        <form action={confirmAction} className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4" noValidate>
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-foreground">
            <li>
              Abra o <strong>Google Authenticator</strong> (ou outro app autenticador) e adicione uma conta.
              <div className="mt-3 flex flex-wrap items-start gap-4">
                <div className="rounded-lg bg-white p-2" aria-label="QR code para o aplicativo autenticador" role="img">
                  <QRCodeSVG value={setup.uri} size={168} marginSize={1} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <a
                    href={setup.uri}
                    className="inline-flex w-fit items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    Abrir no app autenticador (celular)
                  </a>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Ou digite esta chave no app:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs text-foreground">{setup.secret}</code>
                      <Button type="button" size="xs" variant="outline" onClick={() => void copyText(setup.secret, "Chave copiada.")}>
                        <Copy aria-hidden="true" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
            <li>
              Digite aqui o código de 6 números que o app mostrar:
              <FormField label="Código do aplicativo" hideLabel>
                <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" required className="mt-2 max-w-[12rem] tracking-[0.3em]" />
              </FormField>
            </li>
          </ol>
          {confirmState.error && <Alert variant="destructive">{confirmState.error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton state={confirmState} pendingLabel="Verificando..." className="w-auto">
              Confirmar e ativar
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSetup(null);
                setMode("idle");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {enabled && !backupCodes && mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setMode("regenerate")}>
            Gerar novos códigos de backup
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setMode("disable")}>
            Desativar
          </Button>
        </div>
      )}

      {enabled && mode === "regenerate" && (
        <CodeConfirmForm
          action={regenerateBackupCodesAction}
          label="Código do aplicativo (6 números) para gerar novos códigos"
          submitLabel="Gerar novos códigos"
          pendingLabel="Gerando..."
          onCancel={() => setMode("idle")}
          onSuccess={(result) => {
            setMode("idle");
            setBackupCodes(result.backupCodes ?? null);
            router.refresh();
          }}
        />
      )}

      {enabled && mode === "disable" && (
        <CodeConfirmForm
          action={disableTwoFactorAction}
          label="Código do aplicativo (ou de backup) para desativar"
          submitLabel="Desativar verificação"
          pendingLabel="Desativando..."
          destructive
          onCancel={() => setMode("idle")}
          onSuccess={(result) => {
            setMode("idle");
            toast.success(result.success ?? "Verificação em duas etapas desativada.");
            router.refresh();
          }}
        />
      )}

      {backupCodes && <BackupCodesBox codes={backupCodes} onDone={() => setBackupCodes(null)} />}

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
