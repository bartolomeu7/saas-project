import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { buildHealthReport } from "@/lib/health/check";

export const dynamic = "force-dynamic";

/**
 * Saúde do site, para monitores de disponibilidade (uptime). Público, sem sessão e sem segredos:
 * sonda o banco com a chave anônima (RPC pública get_public_plans) e responde 200 (ok) ou 503 (degradado).
 * Não devolve mensagens de erro — só "ok"/"fail" e a versão publicada.
 */
export async function GET() {
  const report = await buildHealthReport(async () => {
    const { error } = await createPublicClient().rpc("get_public_plans");
    return !error;
  }, process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local");

  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
