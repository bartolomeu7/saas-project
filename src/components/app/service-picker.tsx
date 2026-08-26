"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchServicesAction, addSaleItemAction } from "@/lib/sales/actions";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/types/service";
import type { ServicePick } from "@/types/sale";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Busca de serviço por nome/categoria + quantidade, para adicionar a uma venda em rascunho. */
export function ServicePicker({ saleId }: { saleId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServicePick[]>([]);
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
        const picks = await searchServicesAction(query);
        if (requestId.current === currentRequest) {
          setResults(picks);
        }
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleAdd(serviceId: string, quantity: string) {
    setError(null);
    startAdding(async () => {
      const formData = new FormData();
      formData.set("itemType", "service");
      formData.set("serviceId", serviceId);
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
        placeholder="Buscar serviço por nome ou categoria..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
      {isSearching && <p className="text-xs text-muted-foreground">Buscando...</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-border bg-card p-1">
          {results.map((service) => (
            <ServiceResultRow
              key={service.id}
              service={service}
              disabled={isAdding}
              onAdd={(quantity) => handleAdd(service.id, quantity)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ServiceResultRow({
  service,
  disabled,
  onAdd,
}: {
  service: ServicePick;
  disabled: boolean;
  onAdd: (quantity: string) => void;
}) {
  const [quantity, setQuantity] = useState("1");

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-secondary">
      <div className="flex flex-col">
        <span className="text-sm text-foreground">{service.name}</span>
        <span className="text-xs text-muted-foreground">
          {service.category_name ? `${service.category_name} · ` : ""}
          {formatMoney(service.sale_price)} · {formatDuration(service.duration_minutes)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="1"
          min="1"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="h-8 w-20"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdd(quantity)}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </li>
  );
}
