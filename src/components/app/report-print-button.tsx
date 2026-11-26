"use client";

import { Printer } from "lucide-react";

/** Imprime a aba aberta; menu, filtros e botões somem na folha (ver `@media print` em globals.css). */
export function ReportPrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted">
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Imprimir
    </button>
  );
}
