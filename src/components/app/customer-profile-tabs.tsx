import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "resumo", label: "Resumo" },
  { key: "historico", label: "Histórico" },
  { key: "compras", label: "Compras" },
  { key: "servicos", label: "Serviços" },
  { key: "financeiro", label: "Financeiro" },
  { key: "documentos", label: "Documentos" },
  { key: "observacoes", label: "Observações" },
] as const;

export function CustomerProfileTabs({
  customerId,
  activeTab,
}: {
  customerId: string;
  activeTab: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const href =
          tab.key === "resumo"
            ? `/app/clientes/${customerId}`
            : `/app/clientes/${customerId}?tab=${tab.key}`;

        return (
          <Link
            key={tab.key}
            href={href}
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
