import Link from "next/link";
import { Package } from "lucide-react";
import type { ProductWithCategory } from "@/types/product";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ListAvatar } from "@/components/app/list-toolbar";
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

/**
 * Tabela de produtos no visual de "data table": avatar, colunas extras só quando cabem e ações agrupadas.
 * No celular as ações ficam abaixo do nome (sem rolar para o lado). Mesmos dados, links e botões de antes.
 */
export function ProductTable({ products }: { products: ProductWithCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
      <Table className="w-full text-sm sm:min-w-[640px]">
        <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-semibold">Produto</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">SKU</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Categoria</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Preço de venda</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Estoque</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
            <TableHead className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const actions = (
              <>
                <Link
                  href={`/app/produtos/${product.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Ver
                </Link>
                <Link
                  href={`/app/produtos/${product.id}/editar`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Editar
                </Link>
                {product.status === "active" ? (
                  <DeactivateProductButton productId={product.id} productName={product.name} />
                ) : (
                  <ReactivateProductButton productId={product.id} productName={product.name} />
                )}
              </>
            );

            return (
              <TableRow key={product.id} className="hover:bg-secondary/30">
                <TableCell className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ListAvatar>
                      <Package className="h-4 w-4" strokeWidth={1.75} />
                    </ListAvatar>
                    <div className="min-w-0">
                      <Link
                        href={`/app/produtos/${product.id}`}
                        className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:hidden">
                        {formatMoney(product.sale_price)} · {product.stock_quantity} {product.unit}
                        <StockLevelBadge product={product} />
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">{actions}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {product.sku ?? "—"}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                  {product.category_name ?? "—"}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-foreground sm:table-cell">
                  {formatMoney(product.sale_price)}
                </TableCell>
                <TableCell className="hidden px-4 py-3 sm:table-cell">
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
                <TableCell className="hidden px-4 py-3 sm:table-cell">
                  <div className="flex items-center justify-end gap-2">{actions}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
