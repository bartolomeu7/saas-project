import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getProductById } from "@/lib/products/queries";
import { listActiveCategories } from "@/lib/product-categories/queries";
import { getProductSegmentHints } from "@/config/product-segments";
import { updateProductAction } from "@/lib/products/actions";
import { ProductForm } from "@/components/app/product-form";

export const metadata: Metadata = {
  title: "Editar produto",
};

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const product = await getProductById(current.company.id, params.id);

  if (!product) {
    notFound();
  }

  const categories = await listActiveCategories(current.company.id);
  const hints = getProductSegmentHints(current.company.business_type);
  const action = updateProductAction.bind(null, product.id);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href={`/app/produtos/${product.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para {product.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar produto</h1>
      </div>

      <div className="max-w-3xl">
        <ProductForm
          action={action}
          defaultValues={product}
          categories={categories}
          segmentHints={hints}
          submitLabel="Salvar alterações"
        />
      </div>
    </div>
  );
}
