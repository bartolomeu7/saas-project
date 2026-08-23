import Link from "next/link";
import type { CustomerRaffle } from "@/types/raffle";
import { formatDate } from "@/lib/format";

export function RaffleHistoryList({ raffles }: { raffles: CustomerRaffle[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Sorteio</th>
            <th className="px-4 py-3 font-medium">Participantes</th>
            <th className="px-4 py-3 font-medium">Vencedores</th>
            <th className="px-4 py-3 font-medium">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {raffles.map((raffle) => (
            <tr key={raffle.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3">
                <Link
                  href={`/app/clientes/sorteio/${raffle.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {raffle.name ?? "Sorteio sem nome"}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {raffle.participant_count}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {raffle.winner_count}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(raffle.executed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
