import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { getCurrentCompany } from "@/lib/companies/queries";
import {
  getCustomerRanking,
  resolvePeriodRange,
  type RankingPeriod,
  type CustomerRankingEntry,
} from "@/lib/customers/ranking";
import { RankingPeriodSelector } from "@/components/app/ranking-period-selector";
import { RankingSortSelector } from "@/components/app/ranking-sort-selector";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate } from "@/lib/format";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Melhores clientes",
};

function parsePeriod(value?: string): RankingPeriod {
  return value === "quarter" || value === "semester" || value === "year" || value === "custom"
    ? value
    : "month";
}

type SortKey = "revenue" | "frequency" | "averageTicket" | "estimatedMargin";

function parseSort(value?: string): SortKey {
  return value === "frequency" || value === "averageTicket" || value === "estimatedMargin"
    ? value
    : "revenue";
}

const SORT_LABELS: Record<SortKey, string> = {
  revenue: "Maior receita",
  frequency: "Maior frequência",
  averageTicket: "Maior ticket",
  estimatedMargin: "Maior contribuição estimada",
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sortEntries(entries: CustomerRankingEntry[], sortBy: SortKey): CustomerRankingEntry[] {
  return [...entries].sort((a, b) => b[sortBy] - a[sortBy]);
}

export default async function CustomerRankingPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string; sort?: string };
}) {
  const current = (await getCurrentCompany())!;
  const period = parsePeriod(searchParams?.period);
  const sortBy = parseSort(searchParams?.sort);
  const range = resolvePeriodRange(period, searchParams?.from, searchParams?.to);
  const ranking = await getCustomerRanking(current.company.id, period, range);
  const sorted = sortEntries(ranking.entries, sortBy);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/clientes"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Melhores clientes
        </h1>
        <p className="text-sm text-muted-foreground">
          Clientes mais lucrativos e cliente destaque, por período.
        </p>
      </div>

      <RankingPeriodSelector />

      <p className="text-xs text-muted-foreground">
        Período selecionado: {formatDate(range.from)} até {formatDate(range.to)}
      </p>

      {!ranking.hasRevenueData ? (
        <EmptyState
          icon={Trophy}
          title="Ainda não há dados suficientes para calcular o ranking."
          description="Esse indicador aparece assim que houver vendas concluídas vinculadas a um cliente no período selecionado."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sorted[0] && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cliente destaque do período · {SORT_LABELS[sortBy]}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  <Link
                    href={`/app/clientes/${sorted[0].customerId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {sorted[0].customerName}
                  </Link>
                </p>
              </div>
            </div>
          )}

          <RankingSortSelector current={sortBy} labels={SORT_LABELS} />

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table className="w-full min-w-[640px] text-sm">
              <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                <TableRow>
                  <TableHead className="px-4 py-3 font-medium">#</TableHead>
                  <TableHead className="px-4 py-3 font-medium">Cliente</TableHead>
                  <TableHead className="px-4 py-3 font-medium">Receita</TableHead>
                  <TableHead className="px-4 py-3 font-medium">Compras</TableHead>
                  <TableHead className="px-4 py-3 font-medium">Ticket médio</TableHead>
                  <TableHead className="px-4 py-3 font-medium">Contribuição estimada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((entry, index) => (
                  <TableRow key={entry.customerId} className="hover:bg-secondary/30">
                    <TableCell className="px-4 py-3 text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="px-4 py-3 font-medium text-foreground">
                      <Link
                        href={`/app/clientes/${entry.customerId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {entry.customerName}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-foreground">{formatMoney(entry.revenue)}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{entry.frequency}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatMoney(entry.averageTicket)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatMoney(entry.estimatedMargin)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-card/40 p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Como o ranking é calculado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Considera receita gerada, frequência de compras e — a partir do custo
          registrado em cada produto/serviço no momento da venda — a{" "}
          <strong className="text-foreground">contribuição estimada</strong>.{" "}
          <strong className="text-foreground">
            Nunca é definido apenas pelo valor total gasto, e nunca chamado de lucro líquido
          </strong>{" "}
          — a contribuição estimada não inclui despesas operacionais, impostos ou taxas.
        </p>
      </div>
    </div>
  );
}
