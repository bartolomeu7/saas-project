import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteAccountPanel } from "@/components/account/delete-account-panel";
import { parseDeletionPreview } from "@/lib/account/deletion-core";
import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "Privacidade e segurança",
  robots: { index: false },
};

// Depende da sessão: nunca pré-renderizada.
export const dynamic = "force-dynamic";

type PreviewRpcClient = {
  rpc(fn: "account_deletion_preview", args: { p_user_id: string }): Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Perfil → Privacidade e segurança. Fica FORA do layout /app de propósito: o direito de excluir os próprios dados não pode
 * depender de assinatura em dia, de aceite pendente de documento novo nem do limite de sessões.
 */
export default async function PrivacyAndSecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/conta");

  const { data, error } = await (createAdminClient() as unknown as PreviewRpcClient).rpc("account_deletion_preview", { p_user_id: user.id });
  const preview = error ? null : parseDeletionPreview(data);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/app" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Logo iconSize={22} />
        </Link>
        <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao sistema
        </Link>
      </header>

      <main id="conteudo" className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Privacidade e segurança</h1>
          <p className="mt-1 text-sm text-muted-foreground">Seus dados e seus direitos como titular, segundo a LGPD.</p>
        </div>

        <section aria-labelledby="seus-dados" className="rounded-lg border border-border p-5">
          <h2 id="seus-dados" className="text-base font-semibold">
            Seus dados
          </h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground">Nome</dt>
            <dd>{preview?.fullName ?? "—"}</dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd>{preview?.email ?? user.email ?? "—"}</dd>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Para pedir acesso, correção, cópia dos dados ou qualquer outro direito, veja a página{" "}
            <Link href="/direitos-do-titular" className="font-medium text-primary underline-offset-4 hover:underline">
              Direitos do Titular
            </Link>{" "}
            e a{" "}
            <Link href="/politica-de-privacidade" className="font-medium text-primary underline-offset-4 hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>

        {preview ? (
          <DeleteAccountPanel
            blockedReason={preview.blockedReason}
            companies={preview.companies.map((c) => ({
              companyId: c.companyId,
              name: c.name,
              willDelete: c.willDelete,
              hasPaidPlan: c.hasPaidPlan,
              expiresAt: c.expiresAt,
            }))}
          />
        ) : (
          <p role="alert" className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
            Não foi possível carregar as opções de exclusão agora. Atualize a página em instantes.
          </p>
        )}
      </main>
    </div>
  );
}
