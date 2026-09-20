import { Wallet, ArrowDownCircle, ArrowUpCircle, Coins } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import type { CashRegisterSummary } from "@/types/cash-register";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * "Entradas" soma TODAS as formas de pagamento (visão do dia inteiro);
 * "Saldo esperado em espécie" é só dinheiro (é o que existe fisicamente
 * numa gaveta) — os dois nunca devem ser confundidos, por isso ficam em
 * cards visualmente distintos e o segundo é explicitamente rotulado
 * "em espécie".
 */
export function CashRegisterSummaryCards({ summary }: { summary: CashRegisterSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Saldo inicial" value={formatMoney(summary.openingBalance)} icon={Wallet} />
        <StatCard label="Entradas (todas as formas)" value={formatMoney(summary.totalIn)} icon={ArrowUpCircle} />
        <StatCard label="Saídas" value={formatMoney(summary.totalOut)} icon={ArrowDownCircle} />
        <StatCard label="Saldo esperado em espécie" value={formatMoney(summary.expectedCashBalance)} icon={Coins} />
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-4">
        <h3 className="text-sm font-semibold text-muted-foreground">Entradas por forma de pagamento</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(SALE_PAYMENT_METHOD_LABELS) as Array<keyof typeof SALE_PAYMENT_METHOD_LABELS>).map(
            (method) => (
              <div key={method} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{SALE_PAYMENT_METHOD_LABELS[method]}</dt>
                <dd className="text-sm font-medium text-foreground">
                  {formatMoney(summary.inByMethod[method] ?? 0)}
                </dd>
              </div>
            )
          )}
        </dl>
      </div>
    </div>
  );
}
