import Link from "next/link";
import type { CustomerRaffle } from "@/types/raffle";
import { formatDate } from "@/lib/format";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function RaffleHistoryList({ raffles }: { raffles: CustomerRaffle[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table className="w-full text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Sorteio</TableHead>
            <TableHead className="px-4 py-3 font-medium">Participantes</TableHead>
            <TableHead className="px-4 py-3 font-medium">Vencedores</TableHead>
            <TableHead className="px-4 py-3 font-medium">Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {raffles.map((raffle) => (
            <TableRow key={raffle.id} className="hover:bg-secondary/30">
              <TableCell className="px-4 py-3">
                <Link
                  href={`/app/clientes/sorteio/${raffle.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {raffle.name ?? "Sorteio sem nome"}
                </Link>
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {raffle.participant_count}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {raffle.winner_count}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {formatDate(raffle.executed_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
