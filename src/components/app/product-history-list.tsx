import type { LucideIcon } from "lucide-react";
import { PackagePlus, Pencil, PackageCheck, PackageX, ArrowRightLeft, History } from "lucide-react";
import type { AuditLog } from "@/types/audit";
import { EmptyState } from "@/components/app/empty-state";

const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  "product.created": { label: "Produto cadastrado", icon: PackagePlus },
  "product.updated": { label: "Dados atualizados", icon: Pencil },
  "product.activated": { label: "Produto reativado", icon: PackageCheck },
  "product.deactivated": { label: "Produto desativado", icon: PackageX },
  "product.stock_adjusted": { label: "Estoque ajustado", icon: ArrowRightLeft },
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function describeMetadata(log: AuditLog): string | null {
  if (log.action === "product.stock_adjusted") {
    const { previousStock, newStock, reason } = log.metadata as {
      previousStock?: number;
      newStock?: number;
      reason?: string;
    };
    if (previousStock !== undefined && newStock !== undefined) {
      return `${previousStock} → ${newStock}${reason ? ` · ${reason}` : ""}`;
    }
  }
  return null;
}

export function ProductHistoryList({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nenhuma atividade registrada ainda."
        description="Cadastro, edições e ajustes de estoque deste produto vão aparecer aqui."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-5">
      {logs.map((log) => {
        const meta = ACTION_META[log.action] ?? { label: log.action, icon: History };
        const Icon = meta.icon;
        const detail = describeMetadata(log);

        return (
          <li key={log.id} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{meta.label}</p>
              {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
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
