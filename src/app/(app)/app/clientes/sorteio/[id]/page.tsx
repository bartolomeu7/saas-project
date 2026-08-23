import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getRaffleById } from "@/lib/raffles/queries";
import { RaffleEntriesTable } from "@/components/app/raffle-entries-table";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Resultado do sorteio",
};

function formatCriteria(criteria: Record<string, unknown>): string[] {
  const lines: string[] = [];

  lines.push(
    criteria.activeOnly ? "Somente clientes ativos" : "Clientes ativos e inativos"
  );

  if (criteria.registeredFrom || criteria.registeredTo) {
    const from = criteria.registeredFrom
      ? formatDate(new Date(criteria.registeredFrom as string).toISOString())
      : "início";
    const to = criteria.registeredTo
      ? formatDate(new Date(criteria.registeredTo as string).toISOString())
      : "hoje";
    lines.push(`Cadastrados entre ${from} e ${to}`);
  } else {
    lines.push("Sem filtro de data de cadastro");
  }

  lines.push(`Vencedores sorteados: ${criteria.winnerCount ?? "—"}`);

  return lines;
}

export default async function RaffleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const result = await getRaffleById(current.company.id, params.id);

  if (!result) {
    notFound();
  }

  const { raffle, entries } = result;
  const winners = entries.filter((entry) => entry.is_winner);
  const criteriaLines = formatCriteria(raffle.criteria);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/clientes/sorteio"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Sorteios
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {raffle.name ?? "Sorteio sem nome"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Realizado em {formatDate(raffle.executed_at)} · {raffle.participant_count}{" "}
          participante(s) · {raffle.winner_count} vencedor(es)
        </p>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {winners.length > 1 ? "Clientes sorteados" : "Cliente sorteado"}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {winners.map((winner) => (
              <li key={winner.id} className="text-sm">
                <p className="font-medium text-foreground">
                  {winner.customer_name_snapshot}
                </p>
                <p className="text-xs text-muted-foreground">
                  {winner.customer_phone_snapshot ??
                    winner.customer_email_snapshot ??
                    "Sem contato registrado"}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Critérios utilizados
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {criteriaLines.map((line) => (
              <li key={line} className="text-sm text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Participantes ({entries.length})
        </h2>
        <RaffleEntriesTable entries={entries} />
      </div>
    </div>
  );
}
