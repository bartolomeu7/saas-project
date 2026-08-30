import { DollarSign, ShoppingCart, Receipt, Calendar, TrendingUp, Cake, Package } from "lucide-react";
import { DashboardCard } from "@/components/app/dashboard-card";
import { CustomerClassificationBadge } from "@/components/app/customer-classification-badge";
import type { Customer } from "@/types/customer";
import type { CustomerSalesStats, CustomerTopProduct } from "@/lib/sales/queries";
import type { CustomerClassification } from "@/lib/customers/classification";
import { formatDate } from "@/lib/format";

const EMPTY_HINT = "Esse indicador estará disponível quando houver vendas registradas.";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Dias até o próximo aniversário (0 = hoje), ou null se não houver data cadastrada. */
function daysUntilNextBirthday(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const next = new Date(now.getFullYear(), birth.getUTCMonth(), birth.getUTCDate());
  next.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (next < today) {
    next.setFullYear(next.getFullYear() + 1);
  }
  return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

type TextFieldKey =
  | "document"
  | "phone"
  | "whatsapp"
  | "email"
  | "postal_code"
  | "address"
  | "address_number"
  | "complement"
  | "neighborhood"
  | "city"
  | "state";

const FIELDS: { label: string; key: TextFieldKey }[] = [
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
  classification,
  topProducts,
}: {
  customer: Customer;
  salesStats: CustomerSalesStats;
  classification: CustomerClassification;
  topProducts: CustomerTopProduct[];
}) {
  const hasSales = salesStats.purchaseCount > 0;
  const daysToBirthday = daysUntilNextBirthday(customer.birth_date);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Indicadores
          </h2>
          <CustomerClassificationBadge classification={classification} />
        </div>
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
          <div>
            <p className="text-xs uppercase text-muted-foreground">Aniversário</p>
            <p className="flex items-center gap-2 text-sm text-foreground">
              {customer.birth_date ? formatDate(customer.birth_date) : "—"}
              {daysToBirthday !== null && daysToBirthday <= 30 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <Cake className="h-3 w-3" />
                  {daysToBirthday === 0 ? "Hoje!" : `Em ${daysToBirthday} dia(s)`}
                </span>
              )}
            </p>
          </div>
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

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Produtos mais comprados
        </h2>
        {topProducts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            {hasSales
              ? "Esse cliente ainda não comprou nenhum produto (só serviços, ou nenhum item de produto registrado)."
              : EMPTY_HINT}
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            {topProducts.map((product) => (
              <div
                key={product.productId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {product.description}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {product.totalQuantity}x · {formatMoney(product.totalSpent)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
