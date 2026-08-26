import { DollarSign, ShoppingCart, Receipt, Calendar, TrendingUp } from "lucide-react";
import { DashboardCard } from "@/components/app/dashboard-card";
import type { Customer } from "@/types/customer";
import type { CustomerSalesStats } from "@/lib/sales/queries";
import { formatDate } from "@/lib/format";

const EMPTY_HINT = "Esse indicador estará disponível quando houver vendas registradas.";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const FIELDS: { label: string; key: keyof Customer }[] = [
  { label: "Documento", key: "document" },
  { label: "Telefone", key: "phone" },
  { label: "WhatsApp", key: "whatsapp" },
  { label: "E-mail", key: "email" },
  { label: "CEP", key: "postal_code" },
  { label: "Endereço", key: "address" },
  { label: "Número", key: "address_number" },
  { label: "Complemento", key: "complement" },
  { label: "Bairro", key: "neighborhood" },
  { label: "Cidade", key: "city" },
  { label: "Estado", key: "state" },
];

/**
 * Indicadores reais de vendas do cliente (Fase 4) — só considera vendas
 * concluídas. "Margem estimada", nunca "lucro líquido": não inclui
 * despesas operacionais, impostos ou taxas.
 */
export function CustomerSummaryTab({
  customer,
  salesStats,
}: {
  customer: Customer;
  salesStats: CustomerSalesStats;
}) {
  const hasSales = salesStats.purchaseCount > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Indicadores
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <DashboardCard
            label="Total gasto"
            value={hasSales ? formatMoney(salesStats.totalSpent) : "—"}
            icon={DollarSign}
            hint={hasSales ? undefined : EMPTY_HINT}
          />
          <DashboardCard
            label="Número de compras"
            value={hasSales ? salesStats.purchaseCount : "—"}
            icon={ShoppingCart}
            hint={hasSales ? undefined : EMPTY_HINT}
          />
          <DashboardCard
            label="Ticket médio"
            value={
              hasSales && salesStats.averageTicket !== null
                ? formatMoney(salesStats.averageTicket)
                : "—"
            }
            icon={Receipt}
            hint={hasSales ? undefined : EMPTY_HINT}
          />
          <DashboardCard
            label="Última compra"
            value={
              hasSales && salesStats.lastPurchaseAt
                ? formatDate(salesStats.lastPurchaseAt)
                : "—"
            }
            icon={Calendar}
            hint={hasSales ? undefined : EMPTY_HINT}
          />
          <DashboardCard
            label="Margem estimada"
            value={hasSales ? formatMoney(salesStats.estimatedMargin) : "—"}
            icon={TrendingUp}
            hint={hasSales ? undefined : EMPTY_HINT}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Informações
        </h2>
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-6 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <p className="text-xs uppercase text-muted-foreground">
                {field.label}
              </p>
              <p className="text-sm text-foreground">{customer[field.key] ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
