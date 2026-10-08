import { SubscriptionStatusBadge } from "@/components/app/subscription-status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { SubscriptionStatus } from "@/types/billing";

/**
 * Plano + situação do acesso numa célula de tabela. `accessActive` vem do
 * banco (status trialing|active E expires_at no futuro — mesma regra do guard
 * do app); "Expirado" aparece quando o status guardado ainda diz ativo mas a
 * data já passou, porque nenhuma rotina grava `expired` sozinha.
 */
export function AdminSubscriptionCell({
  planName,
  status,
  expiresAt,
  accessActive,
}: {
  planName: string | null;
  status: SubscriptionStatus | null;
  expiresAt: string | null;
  accessActive: boolean;
}) {
  if (!status) {
    return <span className="text-muted-foreground">Sem assinatura</span>;
  }

  const lapsed = !accessActive && (status === "trialing" || status === "active");

  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-foreground">{planName ?? "—"}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {lapsed ? <Badge variant="danger">Acesso expirado</Badge> : <SubscriptionStatusBadge status={status} />}
        {expiresAt && (
          <span className="text-xs text-muted-foreground">
            {accessActive ? "até" : "venceu em"} {formatDate(expiresAt)}
          </span>
        )}
      </div>
    </div>
  );
}
