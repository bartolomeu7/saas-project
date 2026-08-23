import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listActiveCategories } from "@/lib/product-categories/queries";
import { getProductSegmentHints } from "@/config/product-segments";
import { createProductAction } from "@/lib/products/actions";
import { ProductForm } from "@/components/app/product-form";

export const metadata: Metadata = {
  title: "Novo produto",
};

export default async function NewProductPage() {
  const current = (await getCurrentCompany())!;
  const categories = await listActiveCategories(current.company.id);
  const hints = getProductSegmentHints(current.company.business_type);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/produtos"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Produtos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo produto</h1>
        <p className="text-sm text-muted-foreground">
          Apenas o nome é obrigatório — os demais campos podem ser preenchidos depois.
        </p>
      </div>

      <div className="max-w-3xl">
        <ProductForm
          action={createProductAction}
          categories={categories}
          segmentHints={hints}
          submitLabel="Salvar produto"
        />
      </div>
    </div>
  );
}
