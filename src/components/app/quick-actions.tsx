import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { UserPlus, Package, ShoppingCart, Wrench, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSaleSegmentHints } from "@/config/sale-segments";
import type { BusinessType } from "@/types/company";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
}

/**
 * "Novo cliente", "Novo produto", "Novo serviço" e "Nova venda"
 * habilitados — orçamentos ainda não existem no sistema (sem tabela no
 * banco), então aparece desabilitado em vez de linkar para uma rota
 * inexistente. O rótulo de vendas se adapta por segmento (ex:
 * "Novo atendimento" para lava-rápido/estética).
 */
function buildActions(businessType: BusinessType): QuickAction[] {
  const saleLabel = getSaleSegmentHints(businessType).newSaleLabel;
  return [
    { label: "Novo cliente", href: "/app/clientes/novo", icon: UserPlus, enabled: true },
    { label: "Novo produto", href: "/app/produtos/novo", icon: Package, enabled: true },
    { label: saleLabel, href: "/app/vendas/nova", icon: ShoppingCart, enabled: true },
    { label: "Novo serviço", href: "/app/servicos/novo", icon: Wrench, enabled: true },
    { label: "Novo orçamento", href: "/app/orcamentos/novo", icon: FileText, enabled: false },
  ];
}

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

export function QuickActions({ businessType }: { businessType: BusinessType }) {
  const actions = buildActions(businessType);
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <QuickActionButton key={action.label} action={action} />
      ))}
    </div>
  );
}
