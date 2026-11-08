"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/** Botões da folha de impressão (somem na hora de imprimir). */
export function AgendaPrintActions({ backHref }: { backHref: string }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <Printer className="h-4 w-4" aria-hidden /> Imprimir
      </button>
      <Link
        href={backHref}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para a agenda
      </Link>
    </div>
  );
}
