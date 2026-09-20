import type { LucideIcon } from "lucide-react";
import {
  ShoppingCart,
  Pencil,
  CheckCircle2,
  XCircle,
  Wallet,
  ArrowRightLeft,
  History,
} from "lucide-react";
import type { AuditLog } from "@/types/audit";
import { EmptyState } from "@/components/app/empty-state";

const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  "sale.created": { label: "Venda criada", icon: ShoppingCart },
  "sale.updated": { label: "Venda atualizada", icon: Pencil },
  "sale.completed": { label: "Venda concluída", icon: CheckCircle2 },
  "sale.cancelled": { label: "Venda cancelada", icon: XCircle },
  "sale.payment_added": { label: "Pagamento registrado", icon: Wallet },
  "sale.stock_adjusted": { label: "Estoque ajustado", icon: ArrowRightLeft },
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function describeMetadata(log: AuditLog): string | null {
  const metadata = log.metadata as Record<string, unknown>;

  if (log.action === "sale.stock_adjusted" && "stock_before" in metadata) {
    return `${metadata.stock_before} → ${metadata.stock_after}`;
  }
  if (log.action === "sale.payment_added" && "amount" in metadata) {
    return `${metadata.method} · R$ ${metadata.amount}`;
  }
  if (log.action === "sale.cancelled" && metadata.reason) {
    return String(metadata.reason);
  }
  if (log.action === "sale.updated" && metadata.itemAdded) {
    return `Item adicionado: ${metadata.itemAdded}`;
  }
  if (log.action === "sale.updated" && metadata.itemUpdated) {
    return "Item alterado";
  }
  if (log.action === "sale.updated" && metadata.itemRemoved) {
    return "Item removido";
  }
  return null;
}

export function SaleHistoryList({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nenhuma atividade registrada ainda."
        description="Criação, edições, conclusão e pagamentos desta venda vão aparecer aqui."
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
