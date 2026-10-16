import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase ANÔNIMO e sem cookies/sessão, para leituras públicas (catálogo de planos da home).
 * Não toca em cookies()/headers(), então a página que o usa pode ser estática/ISR. Só enxerga o que o papel `anon`
 * enxerga (RPCs públicas como get_public_plans) — nunca usa a service role.
 * Lança se a configuração pública estiver ausente; quem chama decide o fallback (a home mostra "indisponível").
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Configuração pública do Supabase ausente.");
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
