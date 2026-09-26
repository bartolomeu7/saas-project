import { Trophy } from "lucide-react";
import type { CustomerRaffleEntry } from "@/types/raffle";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function RaffleEntriesTable({ entries }: { entries: CustomerRaffleEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table className="w-full text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Participante</TableHead>
            <TableHead className="px-4 py-3 font-medium">Contato</TableHead>
            <TableHead className="px-4 py-3 font-medium">Resultado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow
              key={entry.id}
              className={cn(entry.is_winner && "bg-success/5")}
            >
              <TableCell className="px-4 py-3 font-medium text-foreground">
                {entry.customer_name_snapshot}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {entry.customer_phone_snapshot ?? entry.customer_email_snapshot ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3">
                {entry.is_winner ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                    <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
                    Vencedor{entry.winner_position ? ` #${entry.winner_position}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Participante</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
