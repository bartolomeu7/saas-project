import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Todas as abas já estão funcionais. Uma aba desabilitada (enabled: false)
 * usa o mesmo padrão "Em breve" já usado em sidebar-nav.tsx para módulos
 * ainda não implementados, em vez de uma página placeholder.
 */
const TABS = [
  { key: "configuracoes", label: "Configurações", enabled: true },
  { key: "multiplicadores", label: "Multiplicadores", enabled: true },
  { key: "niveis", label: "Níveis", enabled: true },
  { key: "campanhas", label: "Campanhas", enabled: true },
] as const;

export function LoyaltyTabs({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        if (!tab.enabled) {
          return (
            <span
              key={tab.key}
              aria-disabled="true"
              className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground/50"
            >
              {tab.label}
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                Em breve
              </span>
            </span>
          );
        }

        const isActive = activeTab === tab.key;
        return (
          <Link
            key={tab.key}
            href={`/app/fidelidade?tab=${tab.key}`}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
