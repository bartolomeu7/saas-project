"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import {
  resendConfirmationAction,
  signInAction,
  type ActionResult,
} from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";

const initialState: ActionResult = {};

export function LoginForm({ next }: { next?: string }) {
  const boundAction = signInAction.bind(null, next ?? null);
  const [state, formAction] = useFormState(boundAction, initialState);
  const [email, setEmail] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <FormMessage state={state} />

        <SubmitButton state={state} pendingLabel="Entrando...">Entrar</SubmitButton>
      </form>

      {state.code === "email_not_confirmed" && <ResendConfirmation email={email} />}
    </div>
  );
}

/** Reenvio da confirmação de cadastro (só aparece quando o login falha por e-mail não confirmado). */
function ResendConfirmation({ email }: { email: string }) {
  const [state, formAction] = useFormState(resendConfirmationAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-border pt-4">
      <input type="hidden" name="email" value={email} />
      <FormMessage state={state} />
      <SubmitButton state={state} variant="outline" pendingLabel="Reenviando..." successLabel="Enviado">
        Reenviar e-mail de confirmação
      </SubmitButton>
    </form>
  );
}
