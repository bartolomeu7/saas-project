import Link from "next/link";
import type { ProductWithCategory } from "@/types/product";
import { ProductStatusBadge } from "@/components/app/product-status-badge";
import { StockLevelBadge } from "@/components/app/stock-level-badge";
import { DeactivateProductButton } from "@/components/app/deactivate-product-button";
import { ReactivateProductButton } from "@/components/app/reactivate-product-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ProductTable({ products }: { products: ProductWithCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="w-full min-w-[760px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Produto</TableHead>
            <TableHead className="px-4 py-3 font-medium">SKU</TableHead>
            <TableHead className="px-4 py-3 font-medium">Categoria</TableHead>
            <TableHead className="px-4 py-3 font-medium">Preço de venda</TableHead>
            <TableHead className="px-4 py-3 font-medium">Estoque</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id} className="hover:bg-secondary/30">
              <TableCell className="px-4 py-3 font-medium text-foreground">{product.name}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{product.sku ?? "—"}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {product.category_name ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {formatMoney(product.sale_price)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-foreground">
                    {product.stock_quantity} {product.unit}
                  </span>
                  <StockLevelBadge product={product} />
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">
                <ProductStatusBadge status={product.status} />
              </TableCell>
              <TableCell className="px-4 py-3">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
