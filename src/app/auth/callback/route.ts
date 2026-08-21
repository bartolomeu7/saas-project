import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Endpoint de callback do Supabase Auth.
 *
 * Usado por dois fluxos:
 * - Confirmação de e-mail após cadastro (?next=/app).
 * - Recuperação de senha, antes de chegar em /reset-password
 *   (?next=/reset-password).
 *
 * Troca o "code" da URL por uma sessão válida (cookies) e redireciona
 * para o destino solicitado.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Código ausente ou inválido/expirado — volta para o login com um
  // indicador genérico de erro (sem detalhar a causa).
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
