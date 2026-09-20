import type { LucideIcon } from "lucide-react";
import { Wrench, Pencil, CheckCircle2, XCircle, History } from "lucide-react";
import type { AuditLog } from "@/types/audit";
import { EmptyState } from "@/components/app/empty-state";

const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  "service.created": { label: "Serviço cadastrado", icon: Wrench },
  "service.updated": { label: "Dados atualizados", icon: Pencil },
  "service.activated": { label: "Serviço reativado", icon: CheckCircle2 },
  "service.deactivated": { label: "Serviço desativado", icon: XCircle },
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function ServiceHistoryList({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nenhuma atividade registrada ainda."
        description="Cadastro e edições deste serviço vão aparecer aqui."
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
