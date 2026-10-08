/**
 * Só caminhos internos da área autenticada são aceitos como destino depois do aceite
 * (evita open redirect via ?next=). Módulo puro: testável direto pelo Node.
 */
export function safeAfterConsentPath(next: string | null | undefined): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !next.includes(":") &&
    (next === "/app" || next.startsWith("/app/") || next === "/onboarding")
  ) {
    return next;
  }
  return "/app";
}
