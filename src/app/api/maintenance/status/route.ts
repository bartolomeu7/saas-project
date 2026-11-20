import { NextResponse } from "next/server";
import { getMaintenanceState } from "@/lib/maintenance-state";

export const dynamic = "force-dynamic";

/**
 * Estado público da manutenção programada, para a faixa de aviso do app e a tela de manutenção atualizarem sozinhas.
 * Sem sessão e sem dados internos (a nota interna do admin nunca sai do banco). Passa SEMPRE, mesmo em manutenção total
 * (ver `isMaintenanceAlwaysOpen`). Lê pelo mesmo cache de 12 s do middleware: o banco não é consultado a cada visita.
 */
export async function GET() {
  const state = await getMaintenanceState();
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}
