import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import { createSaleAction } from "@/lib/sales/actions";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Nova venda",
};

/**
 * Não constrói o formulário aqui — cria a venda em rascunho e redireciona
 * para /app/vendas/[id], que já é o construtor completo (adicionar
 * cliente/itens/pagamento) enquanto a venda está em draft, e vira a
 * tela de detalhe assim que ela é concluída. Evita duplicar a mesma
 * interface em duas rotas diferentes.
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

  // createSaleAction termina com redirect() para /app/vendas/[id] — chamado
  // diretamente aqui (Server Component chamando uma Server Action), sem
  // precisar de formulário/clique intermediário.
  await createSaleAction(new FormData());
}
