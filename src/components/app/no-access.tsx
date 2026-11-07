import { Lock } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";

/**
 * Tela exibida no lugar de um módulo que o papel da pessoa não pode usar (matriz em `lib/permissions/matrix.ts`).
 * Reaproveita o EmptyState. O banco também recusa os dados; isto só evita a tela quebrada/vazia e explica o porquê.
 */
export function NoAccess({ area }: { area: string }) {
  return (
    <div className="px-4 py-10 sm:px-6" role="status">
      <EmptyState
        icon={Lock}
        title={`Você não tem acesso a ${area}`}
        description="Esta área é só do dono e dos administradores da empresa. Se você precisa dela, peça a quem gerencia a equipe para ajustar o seu acesso."
        actionLabel="Voltar ao painel"
        actionHref="/app"
      />
    </div>
  );
}
