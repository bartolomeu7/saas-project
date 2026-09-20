import { ArrowUpCircle, ArrowDownCircle, ShoppingCart, PenLine } from "lucide-react";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import type { CashMovementWithName } from "@/types/cash-register";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Histórico imutável (cash_movements não tem policy de UPDATE/DELETE) —
 * de propósito, nenhuma coluna de ações/editar/excluir nesta tabela,
 * automática ou manual.
 */
export function CashMovementsTable({ movements }: { movements: CashMovementWithName[] }) {
  if (movements.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma movimentação registrada neste caixa ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Data/hora</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Forma</th>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Origem</th>
            <th className="px-4 py-3 font-medium">Responsável</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {movements.map((movement) => (
            <tr key={movement.id} className="hover:bg-secondary/30">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {dateTimeFormatter.format(new Date(movement.created_at))}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium " +
                    (movement.direction === "in"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400")
                  }
                >
                  {movement.direction === "in" ? (
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownCircle className="h-3.5 w-3.5" />
                  )}
                  {movement.direction === "in" ? "Entrada" : "Saída"}
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-foreground">{formatMoney(Number(movement.amount))}</td>
              <td className="px-4 py-3 text-muted-foreground">{SALE_PAYMENT_METHOD_LABELS[movement.method]}</td>
              <td className="px-4 py-3 text-muted-foreground">{movement.description}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {movement.source === "sale_payment" ? (
                    <>
                      <ShoppingCart className="h-3.5 w-3.5" /> Pagamento de venda
                    </>
                  ) : (
                    <>
                      <PenLine className="h-3.5 w-3.5" /> Lançamento manual
                    </>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{movement.created_by_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
