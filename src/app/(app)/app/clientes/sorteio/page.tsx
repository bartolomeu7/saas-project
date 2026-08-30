import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import { listRaffles } from "@/lib/raffles/queries";
import { RaffleForm } from "@/components/app/raffle-form";
import { RaffleHistoryList } from "@/components/app/raffle-history-list";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Sortear cliente",
};

export default async function CustomerRafflePage() {
  const current = (await getCurrentCompany())!;
  const supabase = createClient();

  const [raffles, { count: completedSalesCount }] = await Promise.all([
    listRaffles(current.company.id),
    supabase
      .from("sales")
      .select("*", { count: "exact", head: true })
      .eq("company_id", current.company.id)
      .eq("status", "completed")
      .not("customer_id", "is", null),
  ]);

  // Os filtros de compra do sorteio dependem de vendas concluídas
  // vinculadas a um cliente — sem isso, ficam desabilitados em vez de
  // mostrar um filtro que nunca vai encontrar ninguém.
  const hasAnySales = (completedSalesCount ?? 0) > 0;

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
        <RaffleForm hasAnySales={hasAnySales} />
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
