import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

/**
 * Página controlada "em construção" para as seções do painel que ainda não
 * têm fonte de dados confiável. Reaproveita PageHeader e EmptyState do app e
 * nunca exibe números fictícios.
 */
export function ComingSoon({
  title,
  description,
  icon = Construction,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader title={title} eyebrow="Plataforma" description={description} />
      <EmptyState
        icon={icon}
        title="Disponível em breve"
        description="Esta seção será liberada em uma próxima etapa do painel administrativo."
        actionLabel="Voltar ao dashboard"
        actionHref="/admin"
      />
    </div>
  );
}
