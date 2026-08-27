import type { Metadata } from "next";
import Link from "next/link";
import { Package, ShoppingCart } from "lucide-react";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/app/empty-state";
import { NewSaleButton } from "@/components/app/new-sale-button";

export const metadata: Metadata = {
  title: "Nova venda",
};

/**
 * Só mostra um formulário de confirmação aqui — a venda em rascunho só é
 * criada quando o usuário clica em "Iniciar venda" (NewSaleButton), nunca
 * durante o GET/render desta página. Antes, createSaleAction era chamado
 * direto no corpo do Server Component: qualquer GET (refresh, voltar/
 * avançar, prefetch automático de <Link>) criava uma venda-rascunho nova
 * a cada vez. Depois de criada, a venda vai para /app/vendas/[id], que já
 * é o construtor completo (adicionar cliente/itens/pagamento) enquanto
 * está em draft, e vira a tela de detalhe assim que é concluída — evita
 * duplicar a mesma interface em duas rotas diferentes.
 */
export default async function NewSalePage() {
  const current = (await getCurrentCompany())!;
  const supabase = createClient();

  const [{ count: productCount }, { count: serviceCount }] = await Promise.all([
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("company_id", current.company.id)
      .eq("status", "active"),
    supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("company_id", current.company.id)
      .eq("status", "active"),
  ]);

  if (!productCount && !serviceCount) {
    return (
      <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
        <div>
          <Link
            href="/app/vendas"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Voltar para Vendas
          </Link>
        </div>
        <EmptyState
          icon={Package}
          title="Cadastre produtos ou serviços antes de registrar uma venda."
          description="Uma venda precisa de ao menos um produto ou serviço no catálogo para ter o que vender."
          actionLabel="Cadastrar produto"
          actionHref="/app/produtos/novo"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/vendas"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Vendas
        </Link>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <ShoppingCart className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <p className="font-medium text-foreground">Iniciar uma nova venda balcão</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Uma venda em rascunho será criada e você poderá adicionar cliente,
          itens e pagamento na tela seguinte.
        </p>
        <div className="mt-2">
          <NewSaleButton />
        </div>
      </div>
    </div>
  );
}
