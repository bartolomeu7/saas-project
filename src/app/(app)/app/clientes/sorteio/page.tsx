import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listRaffles } from "@/lib/raffles/queries";
import { RaffleForm } from "@/components/app/raffle-form";
import { RaffleHistoryList } from "@/components/app/raffle-history-list";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Sortear cliente",
};

export default async function CustomerRafflePage() {
  const current = (await getCurrentCompany())!;
  const raffles = await listRaffles(current.company.id);

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
          Sortear cliente
        </h1>
        <p className="text-sm text-muted-foreground">
          Sorteie clientes para brindes e promoções. O resultado é
          registrado e não pode ser alterado depois.
        </p>
      </div>

      <div className="max-w-2xl">
        <RaffleForm />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Sorteios anteriores
        </h2>

        {raffles.length === 0 ? (
          <EmptyState
            title="Nenhum sorteio realizado ainda."
            description="Os sorteios que você realizar vão aparecer aqui, com participantes e vencedor registrados."
          />
        ) : (
          <RaffleHistoryList raffles={raffles} />
        )}
      </div>
    </div>
  );
}
