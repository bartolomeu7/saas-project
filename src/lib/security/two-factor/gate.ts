/**
 * Barreira CENTRAL da verificação em duas etapas (usada pelo middleware). Módulo puro: a decisão é uma função dos dados
 * da requisição e do estado lido no banco, sem I/O, e por isso testável direto pelo Node.
 *
 * Quem ativou a segunda etapa precisa cumpri-la UMA vez por sessão do Clerk. Enquanto não cumprir, nada do produto
 * responde: páginas redirecionam para /verificacao-2fa; Server Actions e APIs recebem 403 TWO_FACTOR_REQUIRED (o Next
 * envia Server Actions por POST para a URL da própria página, então elas passam por aqui também).
 *
 * Protegido: /app, /onboarding, /admin, /api/billing e /conta (exclusão da conta). NÃO protegido de propósito:
 * páginas públicas, /login, /register, /aceite-termos, /acesso-sessoes, /api/presence, /api/webhooks e a própria
 * /verificacao-2fa (onde o código é digitado).
 *
 * Sem estado lido (função ausente no banco, fase de expansão do deploy) o middleware libera e registra em log; erro
 * de leitura qualquer FECHA (503), como no restante da autenticação.
 */
export const TWO_FACTOR_PATH = "/verificacao-2fa";
export const TWO_FACTOR_REQUIRED_CODE = "TWO_FACTOR_REQUIRED";
export const TWO_FACTOR_REQUIRED_MESSAGE = "Confirme o código da verificação em duas etapas para continuar.";

export const TWO_FACTOR_GATED_PREFIXES = ["/app", "/onboarding", "/admin", "/api/billing", "/conta"] as const;

export function isTwoFactorGatedPath(pathname: string): boolean {
  return TWO_FACTOR_GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export interface TwoFactorGateStatus {
  required: boolean;
  verified: boolean;
}

/**
 * Lê o retorno de two_factor_gate_status(). Fail-closed: só `required:false` ou `required:true + verified:true` liberam;
 * qualquer formato inesperado conta como "exige e não verificada".
 */
export function parseTwoFactorGateStatus(raw: unknown): TwoFactorGateStatus {
  if (raw && typeof raw === "object") {
    const { required, verified } = raw as { required?: unknown; verified?: unknown };
    if (required === false) return { required: false, verified: true };
    if (required === true && verified === true) return { required: true, verified: true };
  }
  return { required: true, verified: false };
}

export type TwoFactorGateDecision = { action: "allow" } | { action: "redirect"; from: string } | { action: "deny" };

export interface TwoFactorGateInput {
  pathname: string;
  search?: string;
  method: string;
  /** Requisição de Server Action do Next (cabeçalho `next-action`). */
  isServerAction: boolean;
  status: TwoFactorGateStatus;
}

export function decideTwoFactorGate(input: TwoFactorGateInput): TwoFactorGateDecision {
  if (!isTwoFactorGatedPath(input.pathname)) return { action: "allow" };
  if (!input.status.required || input.status.verified) return { action: "allow" };

  const method = input.method.toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  if (input.pathname.startsWith("/api/") || input.isServerAction || !isRead) return { action: "deny" };

  return { action: "redirect", from: input.pathname + (input.search ?? "") };
}

/**
 * Destino depois de verificar (?next=). Só caminhos internos conhecidos; nunca a própria página de verificação nem
 * endereço externo (sem open redirect).
 */
export function safeAfterTwoFactorPath(next: string | null | undefined): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !next.includes(":") &&
    !next.includes("\n") &&
    !next.includes("\r") &&
    ["/app", "/admin", "/onboarding", "/conta"].some((prefix) => next === prefix || next.startsWith(`${prefix}/`) || next.startsWith(`${prefix}?`))
  ) {
    return next;
  }
  return "/app";
}
