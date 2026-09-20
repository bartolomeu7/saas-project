"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchCustomersAction, updateDraftSaleAction } from "@/lib/sales/actions";
import { Input } from "@/components/ui/input";
import type { CustomerPick } from "@/types/sale";

/** Seleção de cliente opcional para uma venda em rascunho — "Venda sem cliente" é sempre válido. */
export function CustomerPicker({
  saleId,
  currentCustomerName,
  loyaltyPointsRedeemed,
}: {
  saleId: string;
  currentCustomerName: string | null;
  /** > 0 trava a troca/remoção de cliente na própria UI — a Server Action já rejeita, mas aqui evita a viagem ao servidor e explica o motivo. */
  loyaltyPointsRedeemed: number;
}) {
  const hasActiveRedemption = loyaltyPointsRedeemed > 0;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSaving] = useTransition();
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
        const picks = await searchCustomersAction(query);
        if (requestId.current === currentRequest) {
          setResults(picks);
        }
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function selectCustomer(customerId: string | null) {
    setError(null);
    startSaving(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId ?? "");
      const result = await updateDraftSaleAction(saleId, {}, formData);
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-foreground">
          Cliente: <strong>{currentCustomerName ?? "Sem cliente"}</strong>
        </span>
        {currentCustomerName && !hasActiveRedemption && (
          <button
            type="button"
            onClick={() => selectCustomer(null)}
            disabled={isSaving}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Remover cliente
          </button>
        )}
      </div>

      {hasActiveRedemption ? (
        <p className="text-xs text-muted-foreground">
          Remova o uso de pontos antes de alterar o cliente desta venda.
        </p>
      ) : (
        <>
          <Input
            type="search"
            placeholder="Buscar cliente por nome, telefone ou e-mail (opcional)..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-sm"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}
          {isSearching && <p className="text-xs text-muted-foreground">Buscando...</p>}

          {results.length > 0 && (
            <ul className="flex max-w-sm flex-col gap-1 rounded-md border border-border bg-card p-1">
              {results.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => selectCustomer(customer.id)}
                    className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
                  >
                    <span className="text-foreground">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {customer.phone ?? customer.email ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
