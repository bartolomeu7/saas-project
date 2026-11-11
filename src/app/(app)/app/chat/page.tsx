import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ChatClient } from "@/components/app/chat/chat-client";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat AI" };
export const dynamic = "force-dynamic";

/**
 * Chat AI (modo teste). Só aparece para quem tem o interruptor global ligado (CHAT_AI_ENABLED) E a empresa ligou o Chat
 * com o módulo Agenda. Se a tabela de configuração ainda não existe no banco, a consulta falha e a página mostra
 * "indisponível" (nunca quebra). Sem item no menu enquanto estiver em teste: acesso por /app/chat.
 */
export default async function ChatPage() {
  const current = await getCurrentCompany();
  let agentName: string | null = null;

  if (process.env.CHAT_AI_ENABLED === "true" && current) {
    const supabase = (await createSessionClient()) as any;
    const { data } = await supabase.from("chat_settings").select("enabled, agent_name, modules").eq("company_id", current.company.id).maybeSingle();
    if (data?.enabled && Array.isArray(data.modules) && data.modules.includes("agenda")) agentName = String(data.agent_name || "Cláudia");
  }

  return (
    <div className="prime-module-page prime-module-page--chat flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader title="Chat AI" description="Peça em linguagem natural; eu pergunto o que faltar e só mostro o resumo para você conferir." />
      {agentName ? (
        <ChatClient agentName={agentName} initialShadow={process.env.CHAT_AI_CONFIRM_ENABLED !== "true"} />
      ) : (
        <EmptyState icon={MessagesSquare} title="O Chat AI ainda não está disponível para a sua empresa." description="Ele está em fase de testes. Quando for liberado, aparece aqui." />
      )}
    </div>
  );
}
