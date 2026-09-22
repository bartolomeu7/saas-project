import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listProducts } from "@/lib/products/queries";
import { listSuppliers } from "@/lib/suppliers/queries";
import { createPurchaseOrderAction } from "@/lib/purchases/actions";
import { PurchaseOrderForm } from "@/components/app/purchase-order-form";

export const metadata: Metadata = { title: "Novo pedido de compra" };

export default async function NewPurchasePage() {
  const current = (await getCurrentCompany())!;
  const [suppliers, products] = await Promise.all([
    listSuppliers(current.company.id),
    listProducts({
      companyId: current.company.id,
      status: "active",
      page: 1,
      pageSize: 1000,
      sortBy: "name",
    }),
  ]);

  if (!suppliers.length) {
    return (
      <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
        <Link href="/app/compras" className="text-sm text-muted-foreground hover:underline">
          ← Voltar para Compras
        </Link>
        <div className="rounded-xl border border-dashed p-8">
          <h1 className="text-xl font-semibold">Cadastre um fornecedor primeiro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O pedido de compra precisa de um fornecedor ativo para continuar.
          </p>
          <Link
            href="/app/fornecedores/novo"
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Novo fornecedor
          </Link>
        </div>
      </div>
    );
  }

  if (!products.products.length) {
    return (
      <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
        <Link href="/app/compras" className="text-sm text-muted-foreground hover:underline">
          ← Voltar para Compras
        </Link>
        <div className="rounded-xl border border-dashed p-8">
          <h1 className="text-xl font-semibold">Cadastre um produto primeiro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            As compras da Fase 2 trabalham com produtos do catálogo atual.
          </p>
          <Link
            href="/app/produtos/novo"
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Novo produto
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/app/compras" className="text-sm text-muted-foreground hover:underline">
        ← Voltar para Compras
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo pedido de compra</h1>
        <p className="text-sm text-muted-foreground">
          Registre custo, quantidade, previsão e vencimento. O estoque só muda no recebimento.
        </p>
      </div>
      <PurchaseOrderForm
        action={createPurchaseOrderAction}
        suppliers={suppliers}
        products={products.products}
      />
    </div>
  );
}