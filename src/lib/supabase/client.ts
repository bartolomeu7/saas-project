import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * Cliente Supabase para uso em Client Components ("use client").
 * Usa apenas a chave pública (anon) — protegida pelo RLS no banco.
 *
 * Uso:
 *   const supabase = createClient();
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
