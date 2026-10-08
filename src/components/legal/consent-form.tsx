"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/shared/auth/form-message";

/**
 * Aceite dos documentos legais: DOIS checkboxes separados e desmarcados (Termos = aceite;
 * Política = ciência), com links que abrem os documentos em nova aba. O botão só habilita com os
 * dois marcados, mas a validação que vale é a do servidor (a action recusa sem os dois e confere
 * as versões vigentes). Nada de consentimento implícito.
 *
 * A Server Action é chamada diretamente dentro de uma transição (sem useFormState, que o React
 * já marcou como renomeado): em sucesso ela redireciona e nada volta; em recusa devolve o erro.
 */
export function ConsentForm({
  action,
  termsVersion,
  privacyVersion,
  submitLabel,
  pendingLabel,
  next,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  termsVersion: string;
  privacyVersion: string;
  submitLabel: string;
  pendingLabel: string;
  next?: string;
}) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  const termsError = state.field === "terms" ? state.error : undefined;
  const privacyError = state.field === "privacy" ? state.error : undefined;
  const linkClass = "font-medium text-primary underline underline-offset-4 hover:text-primary/80";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action({}, formData);
      if (result?.error) setState({ ...result });
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="termsVersion" value={termsVersion} />
      <input type="hidden" name="privacyVersion" value={privacyVersion} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormMessage state={state} />

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="legal-terms"
            name="terms"
            checked={terms}
            onCheckedChange={(value) => setTerms(value === true)}
            aria-invalid={termsError ? true : undefined}
            aria-describedby={termsError ? "legal-terms-error" : undefined}
            className="mt-0.5 h-5 w-5"
          />
          <div className="min-w-0">
            <Label htmlFor="legal-terms" className="text-sm font-normal leading-6">
              Li e aceito os{" "}
              <Link href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className={linkClass}>
                Termos de Uso
              </Link>{" "}
              <span className="text-muted-foreground">(versão {termsVersion})</span>.
            </Label>
            {termsError && (
              <p id="legal-terms-error" role="alert" className="mt-1 text-xs font-medium text-destructive">
                {termsError}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="legal-privacy"
            name="privacy"
            checked={privacy}
            onCheckedChange={(value) => setPrivacy(value === true)}
            aria-invalid={privacyError ? true : undefined}
            aria-describedby={privacyError ? "legal-privacy-error" : undefined}
            className="mt-0.5 h-5 w-5"
          />
          <div className="min-w-0">
            <Label htmlFor="legal-privacy" className="text-sm font-normal leading-6">
              Li e estou ciente da{" "}
              <Link href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className={linkClass}>
                Política de Privacidade
              </Link>{" "}
              <span className="text-muted-foreground">(versão {privacyVersion})</span>.
            </Label>
            {privacyError && (
              <p id="legal-privacy-error" role="alert" className="mt-1 text-xs font-medium text-destructive">
                {privacyError}
              </p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending || !(terms && privacy)} aria-live="polite">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {pendingLabel}
          </>
        ) : (
          submitLabel
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        O aceite é registrado com a versão dos documentos, a data e a hora. Os dois itens são separados e
        ambos são necessários para criar a conta e usar o Prime Ges.
      </p>
    </form>
  );
}
