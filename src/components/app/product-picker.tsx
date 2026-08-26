"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchProductsAction, addSaleItemAction } from "@/lib/sales/actions";
import { Input } from "@/components/ui/input";
import type { ProductPick } from "@/types/sale";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Busca de produto por nome/SKU/código de barras + quantidade, para adicionar a uma venda em rascunho. */
export function ProductPicker({ saleId }: { saleId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductPick[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isAdding, startAdding] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const currentRequest = ++requestId.current;
    const timeout = setTimeout(() => {
      startSearch(async () => {
        const picks = await searchProductsAction(query);
        if (requestId.current === currentRequest) {
          setResults(picks);
        }
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleAdd(productId: string, quantity: string) {
    setError(null);
    startAdding(async () => {
      const formData = new FormData();
      formData.set("itemType", "product");
      formData.set("productId", productId);
      formData.set("quantity", quantity || "1");
      formData.set("discountAmount", "0");
      const result = await addSaleItemAction(saleId, {}, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setQuery("");
        setResults([]);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        placeholder="Buscar produto por nome, SKU ou código de barras..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
      {isSearching && <p className="text-xs text-muted-foreground">Buscando...</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-border bg-card p-1">
          {results.map((product) => (
            <ProductResultRow
              key={product.id}
              product={product}
              disabled={isAdding}
              onAdd={(quantity) => handleAdd(product.id, quantity)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductResultRow({
  product,
  disabled,
  onAdd,
}: {
  product: ProductPick;
  disabled: boolean;
  onAdd: (quantity: string) => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const outOfStock = product.stock_quantity <= 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-secondary">
      <div className="flex flex-col">
        <span className="text-sm text-foreground">{product.name}</span>
        <span className="text-xs text-muted-foreground">
          {product.sku ? `SKU ${product.sku} · ` : ""}
          {formatMoney(product.sale_price)} · estoque {product.stock_quantity} {product.unit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.001"
          min="0.001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="h-8 w-20"
        />
        <button
          type="button"
          disabled={disabled || outOfStock}
          onClick={() => onAdd(quantity)}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {outOfStock ? "Sem estoque" : "Adicionar"}
        </button>
      </div>
    </li>
  );
}
