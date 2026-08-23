import { DollarSign, ShoppingCart, Wrench, Receipt, Calendar, Repeat } from "lucide-react";
import { DashboardCard } from "@/components/app/dashboard-card";
import type { Customer } from "@/types/customer";

const EMPTY_HINT =
  "Esse indicador estará disponível quando houver vendas/serviços registrados.";

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
 * Indicadores de vendas/serviços do cliente. Nesta fase os módulos de
 * Vendas e Serviços ainda não existem — nenhum número é inventado, só o
 * layout preparado para quando houver dados reais.
 */
export function CustomerSummaryTab({ customer }: { customer: Customer }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Indicadores
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <DashboardCard label="Total gasto" value="—" icon={DollarSign} hint={EMPTY_HINT} />
          <DashboardCard label="Total de compras" value="—" icon={ShoppingCart} hint={EMPTY_HINT} />
          <DashboardCard label="Total de serviços" value="—" icon={Wrench} hint={EMPTY_HINT} />
          <DashboardCard label="Ticket médio" value="—" icon={Receipt} hint={EMPTY_HINT} />
          <DashboardCard label="Última compra" value="—" icon={Calendar} hint={EMPTY_HINT} />
          <DashboardCard label="Frequência" value="—" icon={Repeat} hint={EMPTY_HINT} />
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
