import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Cliente Supabase com a chave "service_role".
 *
 * ⚠️ ATENÇÃO:
 * - Este cliente IGNORA o Row Level Security (RLS).
 * - NUNCA importe este arquivo em código que roda no browser
 *   (Client Components, hooks, etc.).
 * - Uso restrito a: Route Handlers, Server Actions e Edge Functions
 *   que precisem de acesso administrativo explícito e controlado.
 * - Ainda não utilizado nesta etapa — preparado para quando for
 *   necessário (ex: webhooks de pagamento, jobs administrativos).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
