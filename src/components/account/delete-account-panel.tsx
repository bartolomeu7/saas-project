"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMyAccountAction } from "@/lib/account/actions";
import { BLOCKED_MESSAGES, DELETE_CONFIRM_WORD, isDeletionConfirmed, type DeletionBlockedReason } from "@/lib/account/deletion-core";

export interface DeletePanelCompany {
  companyId: string;
  name: string;
  willDelete: boolean;
  hasPaidPlan: boolean;
  expiresAt: string | null;
}

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

/**
 * Zona de perigo da página "Privacidade e segurança": mostra, antes de qualquer clique, o que será apagado, o que a lei
 * manda guardar e os impedimentos; exige digitar EXCLUIR. Quem decide e executa é o servidor (Server Action).
 */
export function DeleteAccountPanel({
  blockedReason,
  companies,
}: {
  blockedReason: DeletionBlockedReason | null;
  companies: DeletePanelCompany[];
}) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toDelete = companies.filter((c) => c.willDelete);
  const toLeave = companies.filter((c) => !c.willDelete);
  const withPaidPlan = toDelete.filter((c) => c.hasPaidPlan);
  const confirmed = isDeletionConfirmed(confirmation);

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("confirmation", confirmation);
    startTransition(async () => {
      const result = await deleteMyAccountAction({}, formData);
      if (result.done) {
        // a sessão do Clerk já deixou de existir no servidor; o signOut só limpa o navegador
        const target = `/conta-excluida?e=${result.emailSent ? "1" : "0"}`;
        try {
          await signOut({ redirectUrl: target });
        } catch {
          router.push(target);
        }
        return;
      }
      setError(result.error ?? "Não foi possível excluir a conta.");
    });
  }

  return (
    <section aria-labelledby="excluir-conta" className="rounded-lg border border-destructive/40 p-5">
      <h2 id="excluir-conta" className="text-base font-semibold text-destructive">
        Excluir minha conta
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Exclui os seus dados pessoais e, se você for a única pessoa da empresa, todos os dados dela. Esta ação não pode ser desfeita.
      </p>

      {blockedReason ? (
        <div role="alert" className="mt-4 flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>{BLOCKED_MESSAGES[blockedReason]}</p>
        </div>
      ) : (
        <AlertDialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null); setConfirmation(""); } }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4">
              Excluir minha conta
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a sua conta?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Vamos eliminar os seus dados pessoais: nome, e-mail, foto, login e preferências. Depois disso, você deixa de ter acesso.</p>

                  {toDelete.length > 0 && (
                    <div>
                      <p className="font-medium text-foreground">Serão apagadas por inteiro, com todos os dados (clientes, produtos, vendas, caixa, financeiro e arquivos):</p>
                      <ul className="mt-1 list-disc pl-5">
                        {toDelete.map((c) => (
                          <li key={c.companyId}>{c.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {toLeave.length > 0 && (
                    <div>
                      <p className="font-medium text-foreground">Você sairá das empresas abaixo, que continuam com as outras pessoas:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {toLeave.map((c) => (
                          <li key={c.companyId}>{c.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {withPaidPlan.length > 0 && (
                    <p role="note" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-foreground">
                      {withPaidPlan.map((c) => c.name).join(", ")} tem plano pago{withPaidPlan[0]?.expiresAt ? ` até ${DATE.format(new Date(withPaidPlan[0].expiresAt))}` : ""}. Excluir a conta
                      não devolve o valor automaticamente. Se for desistir em até 7 dias da compra, peça o reembolso antes, pelo canal de atendimento
                      (devolvemos em 10 a 15 dias úteis).
                    </p>
                  )}

                  <p>
                    <span className="font-medium text-foreground">O que a lei nos obriga a manter</span>, sem identificar você: o registro do
                    aceite dos Termos e da Política de Privacidade e, se houve pagamento, os dados da cobrança (valor, data e identificador, sem
                    nome nem documento), por até 5 anos. Seguimos a LGPD (art. 16).
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="mt-2 grid gap-2">
              <Label htmlFor="confirmacao-exclusao">
                Para confirmar, digite <span className="font-mono font-semibold">{DELETE_CONFIRM_WORD}</span>
              </Label>
              <Input
                id="confirmacao-exclusao"
                autoComplete="off"
                autoCapitalize="characters"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "erro-exclusao" : undefined}
                disabled={pending}
              />
              {error && (
                <p id="erro-exclusao" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" onClick={submit} disabled={!confirmed || pending}>
                {pending ? "Excluindo…" : "Excluir definitivamente"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
