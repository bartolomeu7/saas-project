import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, MessagesSquare, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ChatClient } from "@/components/app/chat/chat-client";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getChatSettings } from "@/lib/chat/server/store";

export const metadata: Metadata = { title: "Chat AI" };
export const dynamic = "force-dynamic";

/**
 * Chat AI (em desenvolvimento). Aparece para todas as empresas quando o interruptor global (CHAT_AI_ENABLED) está ligado,
 * a não ser que a empresa tenha uma linha em chat_settings com enabled=false. Se a tabela de configuração não existir ou a
 * leitura falhar, a página mostra "indisponível" (nunca quebra). Tela enxuta: o chat ocupa a altura toda; o aviso de
 * desenvolvimento é uma faixa de uma linha que abre para ler mais.
 */
export default async function ChatPage() {
  const current = await getCurrentCompany();
  let agentName: string | null = null;

  if (process.env.CHAT_AI_ENABLED === "true" && current) {
    const settings = await getChatSettings(current.company.id);
    if (settings?.enabled && settings.modules.includes("agenda")) agentName = settings.agentName;
  }

  if (!agentName) {
    return (
      <div className="prime-module-page prime-module-page--chat flex flex-col gap-6 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold">Chat AI</h1>
        <EmptyState icon={MessagesSquare} title="O Chat AI ainda não está disponível para a sua empresa." description="Ele está em desenvolvimento e pode estar desligado para a sua empresa. Quando estiver liberado, aparece aqui." />
      </div>
    );
  }

  return (
    <div className="prime-module-page prime-module-page--chat mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col gap-2 px-2 py-2 sm:px-4 sm:py-4">
      <h1 className="sr-only">Chat AI</h1>
      <details role="note" className="group shrink-0 rounded-xl border border-warning/40 bg-warning/10 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1">
            <strong>Em desenvolvimento</strong> · pode errar. Prefira usar as telas manualmente.
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          <span className="sr-only">Ler mais</span>
        </summary>
        <p className="border-t border-warning/30 px-3 py-2 text-foreground">
          O Chat AI ainda está sendo construído e <strong>pode errar</strong>. Por enquanto, é recomendável usar as telas manualmente (por exemplo, a{" "}
          <Link href="/app/agenda" className="font-medium underline underline-offset-4">
            Agenda
          </Link>
          ) e conferir tudo antes de confirmar. Nada é gravado sem o seu clique em Confirmar.
        </p>
      </details>
      <ChatClient agentName={agentName} initialShadow={process.env.CHAT_AI_CONFIRM_ENABLED !== "true"} className="flex-1" />
    </div>
  );
}
