"use client";

import { useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { describeClerkError } from "@/lib/settings/clerk-errors";

/** Tamanho mínimo configurado no Clerk de produção (auth_password.min_length). A regra final é sempre a do Clerk. */
const MIN_PASSWORD_LENGTH = 15;

/**
 * Trocar (ou criar) a senha. Quem entra só com Google/Discord/Microsoft pode não ter senha: nesse caso o formulário
 * cria uma, sem pedir a atual. A senha nunca passa pelo nosso servidor: vai direto para o Clerk.
 */
export function PasswordForm() {
  const { isLoaded, user } = useUser();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);

  if (!isLoaded || !user) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-busy="true" aria-label="Carregando" />;
  }

  const currentUser = user;
  const hasPassword = currentUser.passwordEnabled;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (hasPassword && !current) {
      setError("Digite a senha atual.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setError("A confirmação não é igual à nova senha.");
      return;
    }
    if (hasPassword && next === current) {
      setError("A nova senha precisa ser diferente da atual.");
      return;
    }
    startTransition(async () => {
      try {
        await currentUser.updatePassword({
          newPassword: next,
          ...(hasPassword ? { currentPassword: current } : {}),
          signOutOfOtherSessions: signOutOthers,
        });
        setCurrent("");
        setNext("");
        setConfirm("");
        toast.success(hasPassword ? "Senha alterada." : "Senha criada.");
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {!hasPassword && (
        <Alert>Você entra com uma conta social e ainda não tem senha. Crie uma para também poder entrar com e-mail e senha.</Alert>
      )}
      {hasPassword && (
        <FormField label="Senha atual">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={hasPassword ? "Nova senha" : "Senha"} hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres. Evite senhas já usadas em outros sites.`}>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Repita a nova senha">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={signOutOthers}
          onChange={(e) => setSignOutOthers(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-[hsl(var(--primary-solid))]"
        />
        Sair dos outros aparelhos depois de trocar
      </label>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {hasPassword ? "Alterar senha" : "Criar senha"}
        </Button>
      </div>
    </form>
  );
}
