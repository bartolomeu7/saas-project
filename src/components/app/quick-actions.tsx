import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { UserPlus, Package, ShoppingCart, Wrench, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
}

/**
 * "Novo cliente", "Novo produto" e "Novo serviço" habilitados — vendas e
 * orçamentos ainda não existem no sistema (sem tabela no banco), então
 * aparecem desabilitados em vez de linkarem para uma rota inexistente.
 */
const ACTIONS: QuickAction[] = [
  { label: "Novo cliente", href: "/app/clientes/novo", icon: UserPlus, enabled: true },
  { label: "Novo produto", href: "/app/produtos/novo", icon: Package, enabled: true },
  { label: "Nova venda", href: "/app/vendas/novo", icon: ShoppingCart, enabled: false },
  { label: "Novo serviço", href: "/app/servicos/novo", icon: Wrench, enabled: true },
  { label: "Novo orçamento", href: "/app/orcamentos/novo", icon: FileText, enabled: false },
];

function QuickActionButton({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  const content = (
    <>
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {action.label}
      {!action.enabled && (
        <span className="ml-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
          Em breve
        </span>
      )}
    </>
  );

  const className = cn(
    "flex flex-1 min-w-[150px] items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors",
    action.enabled
      ? "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary"
      : "cursor-not-allowed border-border/60 bg-card/40 text-muted-foreground/60"
  );

  if (!action.enabled) {
    return (
      <span aria-disabled="true" title="Em breve" className={className}>
        {content}
      </span>
    );
  }

  return (
    <Link href={action.href} className={className}>
      {content}
    </Link>
  );
}

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      {ACTIONS.map((action) => (
        <QuickActionButton key={action.label} action={action} />
      ))}
    </div>
  );
}
