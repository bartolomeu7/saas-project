import { Trophy } from "lucide-react";
import type { CustomerRaffleEntry } from "@/types/raffle";
import { cn } from "@/lib/utils";

export function RaffleEntriesTable({ entries }: { entries: CustomerRaffleEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Participante</th>
            <th className="px-4 py-3 font-medium">Contato</th>
            <th className="px-4 py-3 font-medium">Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={cn(entry.is_winner && "bg-success/5")}
            >
              <td className="px-4 py-3 font-medium text-foreground">
                {entry.customer_name_snapshot}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {entry.customer_phone_snapshot ?? entry.customer_email_snapshot ?? "—"}
              </td>
              <td className="px-4 py-3">
                {entry.is_winner ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                    <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
                    Vencedor{entry.winner_position ? ` #${entry.winner_position}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Participante</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
