"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Imprime (ou salva em PDF pelo navegador) só o recibo: o resto da tela some na impressão. */
export function PrintReceiptButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
      <Printer className="h-4 w-4" aria-hidden /> Imprimir recibo
    </Button>
  );
}
