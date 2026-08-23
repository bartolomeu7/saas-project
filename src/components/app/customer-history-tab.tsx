import type { LucideIcon } from "lucide-react";
import { UserPlus, Pencil, UserX, UserCheck, History } from "lucide-react";
import type { AuditLog } from "@/types/audit";
import { EmptyState } from "@/components/app/empty-state";

const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  "customer.created": { label: "Cliente cadastrado", icon: UserPlus },
  "customer.updated": { label: "Dados atualizados", icon: Pencil },
  "customer.deactivated": { label: "Cliente desativado", icon: UserX },
  "customer.reactivated": { label: "Cliente reativado", icon: UserCheck },
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** Cronologia real de eventos do cliente — vem de audit_logs, nunca inventada. */
export function CustomerHistoryTab({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nenhuma atividade registrada ainda."
        description="Cadastro, edições e mudanças de status deste cliente vão aparecer aqui."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-5">
      {logs.map((log) => {
        const meta = ACTION_META[log.action] ?? { label: log.action, icon: History };
        const Icon = meta.icon;

        return (
          <li key={log.id} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{meta.label}</p>
              <p className="text-xs text-muted-foreground">
                {dateTimeFormatter.format(new Date(log.created_at))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
