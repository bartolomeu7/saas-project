import Link from "next/link";
import type { ProductWithCategory } from "@/types/product";
import { ProductStatusBadge } from "@/components/app/product-status-badge";
import { StockLevelBadge } from "@/components/app/stock-level-badge";
import { DeactivateProductButton } from "@/components/app/deactivate-product-button";
import { ReactivateProductButton } from "@/components/app/reactivate-product-button";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ProductTable({ products }: { products: ProductWithCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Produto</th>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Preço de venda</th>
            <th className="px-4 py-3 font-medium">Estoque</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => (
            <tr key={product.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{product.sku ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {product.category_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatMoney(product.sale_price)}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-foreground">
                    {product.stock_quantity} {product.unit}
                  </span>
                  <StockLevelBadge product={product} />
                </div>
              </td>
              <td className="px-4 py-3">
                <ProductStatusBadge status={product.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/app/produtos/${product.id}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/app/produtos/${product.id}/editar`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Editar
                  </Link>
                  {product.status === "active" ? (
                    <DeactivateProductButton
                      productId={product.id}
                      productName={product.name}
                    />
                  ) : (
                    <ReactivateProductButton
                      productId={product.id}
                      productName={product.name}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
