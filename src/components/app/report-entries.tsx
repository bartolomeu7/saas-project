import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { listEntriesForComposition } from "@/lib/finance/queries";
import { compositionTotal } from "@/lib/finance/dre";
import { formatCurrency, formatDate } from "@/lib/format";
import type { EntryComposition } from "@/lib/reports/period";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/sale";
import { cn } from "@/lib/utils";

const TITLES: Record<EntryComposition, string> = {
  "outras-receitas": "Outras receitas",
  despesas: "Despesas operacionais",
  recebimentos: "Recebimentos de vendas",
};

export function parseComposition(value: string | undefined): EntryComposition | null {
  return value !== undefined && Object.hasOwn(TITLES, value) ? (value as EntryComposition) : null;
}

/** Lançamentos que formam um número dos Relatórios, com o mesmo total. Só leitura. */
export async function ReportEntries({ companyId, composition, fromDate, toDate }: { companyId: string; composition: EntryComposition; fromDate: string; toDate: string }) {
  const { entries, truncated } = await listEntriesForComposition(companyId, composition, fromDate, toDate);

  return (
    <section className="rounded-xl border border-border bg-card/40">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">{TITLES[composition]}</h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(fromDate)} a {formatDate(toDate)} · {entries.length} lançamento(s)
          </p>
        </div>
        <p className="text-2xl font-semibold">{formatCurrency(compositionTotal(entries, composition))}</p>
      </div>
      <div className="overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-secondary/60 text-[11px] uppercase tracking-wider">
            <TableRow className="border-b text-left text-muted-foreground">
              <TableHead className="p-3">Data</TableHead>
              <TableHead className="p-3">Descrição</TableHead>
              <TableHead className="hidden p-3 sm:table-cell">Forma</TableHead>
              <TableHead className="p-3 text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id} className="border-b last:border-0">
                <TableCell className="whitespace-nowrap p-3">{formatDate(entry.occurred_on)}</TableCell>
                <TableCell className="p-3">{entry.description}</TableCell>
                <TableCell className="hidden p-3 sm:table-cell">{entry.method ? SALE_PAYMENT_METHOD_LABELS[entry.method] : "—"}</TableCell>
                <TableCell className={cn("whitespace-nowrap p-3 text-right font-semibold", entry.direction === "income" ? "text-emerald-700 dark:text-emerald-500" : "text-rose-600 dark:text-rose-500")}>
                  {entry.direction === "expense" ? "−" : "+"}
                  {formatCurrency(Number(entry.amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!entries.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento neste período.</p> : null}
      </div>
      {truncated ? <p className="border-t p-3 text-xs text-muted-foreground">Mostrando os 2.000 lançamentos mais recentes: o total acima é parcial. Use um período menor.</p> : null}
      <div className="flex flex-wrap gap-4 border-t p-4 text-sm">
        <Link href={`/app/relatorios?period=custom&from=${fromDate}&to=${toDate}`} className="font-medium text-primary hover:underline">Voltar aos Relatórios</Link>
        <Link href="/app/financeiro?view=lancamentos" className="font-medium text-primary hover:underline">Ver todos os lançamentos</Link>
      </div>
    </section>
  );
}
