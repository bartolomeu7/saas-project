import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ChatClient } from "@/components/app/chat/chat-client";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getChatSettings } from "@/lib/chat/server/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "Chat AI" };
export const dynamic = "force-dynamic";

/**
 * Chat AI (em desenvolvimento). Aparece para todas as empresas quando o interruptor global (CHAT_AI_ENABLED) está ligado, a não ser que a
 * empresa tenha uma linha em chat_settings com enabled=false. Se a tabela de configuração ainda não existe no banco, a consulta falha e a página mostra
 * "indisponível" (nunca quebra). Item "Chat AI" no menu para todos, com o aviso de que está em desenvolvimento.
 */
export default async function ChatPage() {
  const current = await getCurrentCompany();
  let agentName: string | null = null;

  if (process.env.CHAT_AI_ENABLED === "true" && current) {
    const settings = await getChatSettings(current.company.id);
    if (settings?.enabled && settings.modules.includes("agenda")) agentName = settings.agentName;
  }

  return (
    <div className="prime-module-page prime-module-page--chat flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader title="Chat AI" description="Peça em linguagem natural; eu pergunto o que faltar e só mostro o resumo para você conferir." />
      {agentName ? (
        <Alert variant="warning" role="note">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Em desenvolvimento</AlertTitle>
          <AlertDescription className="text-foreground">
            O Chat AI ainda está sendo construído e <strong>pode errar</strong>. Por enquanto, é recomendável usar as telas manualmente (por exemplo, a{" "}
            <Link href="/app/agenda" className="font-medium underline underline-offset-4">Agenda</Link>) e conferir tudo antes de confirmar. Nada é gravado sem o seu clique em Confirmar.
          </AlertDescription>
        </Alert>
      ) : null}
      {agentName ? (
        <ChatClient agentName={agentName} initialShadow={process.env.CHAT_AI_CONFIRM_ENABLED !== "true"} />
      ) : (
        <EmptyState icon={MessagesSquare} title="O Chat AI ainda não está disponível para a sua empresa." description="Ele está em desenvolvimento e pode estar desligado para a sua empresa. Quando estiver liberado, aparece aqui." />
      )}
    </div>
  );
}
