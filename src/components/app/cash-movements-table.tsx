import { ArrowUpCircle, ArrowDownCircle, ShoppingCart, PenLine } from "lucide-react";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import type { CashMovementWithName } from "@/types/cash-register";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

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
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma movimentação registrada neste caixa ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
      <Table className="w-full text-sm sm:min-w-[560px]">
        <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-semibold">Data/hora</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Tipo</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Valor</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Forma</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Descrição</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Origem</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Responsável</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => (
            <TableRow key={movement.id} className="hover:bg-secondary/30">
              <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {dateTimeFormatter.format(new Date(movement.created_at))}
              </TableCell>
              <TableCell className="px-4 py-3">
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
              </TableCell>
              <TableCell className="px-4 py-3 font-medium text-foreground">{formatMoney(Number(movement.amount))}</TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">{SALE_PAYMENT_METHOD_LABELS[movement.method]}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{movement.description}</TableCell>
              <TableCell className="hidden px-4 py-3 lg:table-cell">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {movement.source === "sale_payment" ? (
                    <>
                      <ShoppingCart className="h-3.5 w-3.5" /> Pagamento de venda
                    </>
                  ) : movement.description.startsWith("Estorno de pagamento de venda") ? (
                    <>
                      <ShoppingCart className="h-3.5 w-3.5" /> Estorno de venda
                    </>
                  ) : (
                    <>
                      <PenLine className="h-3.5 w-3.5" /> Lançamento manual
                    </>
                  )}
                </span>
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{movement.created_by_name ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
