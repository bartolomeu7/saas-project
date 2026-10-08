import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Heartbeat de presença. Usa o client de sessão (Clerk + anon): touch_presence()
 * resolve o usuário pelo JWT, só reconhece perfil ATIVO e faz upsert com
 * throttle de 30 s. Sem sessão (ou perfil bloqueado) a RPC é no-op e a resposta
 * é 204 — nunca expõe dados.
 */
export async function POST() {
  try {
    const supabase = await createSessionClient();
    await supabase.rpc("touch_presence");
  } catch {
    // presença é melhor-esforço
  }
  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}
