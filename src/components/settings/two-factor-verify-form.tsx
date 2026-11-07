"use client";

import { useFormState } from "react-dom";
import { verifyTwoFactorAction, type TwoFactorActionState } from "@/lib/security/two-factor/actions";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormField } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";

const initialState: TwoFactorActionState = {};

/** Formulário da segunda etapa do login: um campo para o código do app ou de backup. */
export function TwoFactorVerifyForm({ next }: { next: string }) {
  const [state, formAction] = useFormState(verifyTwoFactorAction, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4 text-left" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormField label="Código" hint="6 números do aplicativo, ou um código de backup (XXXXX-XXXXX).">
        <Input
          name="code"
          autoFocus
          autoComplete="one-time-code"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          required
          className="text-center text-lg tracking-[0.25em]"
        />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton state={state} pendingLabel="Verificando...">
        Verificar e entrar
      </SubmitButton>
    </form>
  );
}
