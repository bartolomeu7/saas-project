"use client";

import { useCallback, useState } from "react";
import type { ActionResult } from "@/lib/auth/actions";
import { ConsentForm } from "@/components/legal/consent-form";
import { SignupConsentConfirm } from "@/components/legal/signup-consent-confirm";

/**
 * Tela de aceite pós-login. Se o servidor indicou que há um token de cadastro válido para este
 * usuário novo, tenta confirmá-lo automaticamente (sem pedir os checkboxes de novo); se o
 * servidor recusar, ou se não houver token, mostra o aceite explícito.
 */
export function AcceptGate({
  autoConfirm,
  next,
  termsVersion,
  privacyVersion,
  action,
}: {
  autoConfirm: boolean;
  next: string;
  termsVersion: string;
  privacyVersion: string;
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const [showForm, setShowForm] = useState(!autoConfirm);
  const fallback = useCallback(() => setShowForm(true), []);

  if (!showForm) return <SignupConsentConfirm next={next} onFallback={fallback} />;

  return (
    <ConsentForm
      action={action}
      next={next}
      termsVersion={termsVersion}
      privacyVersion={privacyVersion}
      submitLabel="Aceitar e continuar"
      pendingLabel="Registrando aceite..."
    />
  );
}
