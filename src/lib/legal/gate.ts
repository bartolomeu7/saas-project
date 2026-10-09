/**
 * Barreira CENTRAL do consentimento legal (usada pelo middleware). Módulo puro: a decisão é uma função
 * dos dados da requisição e do status de consentimento, sem I/O, e por isso testável direto pelo Node.
 *
 * O que é protegido: tudo que o usuário autenticado faz no produto — páginas (/app, /onboarding, /admin),
 * Server Actions (o Next as envia por POST para a URL da própria página, então passam por aqui) e as APIs que
 * agem em nome do usuário (/api/billing). NÃO é protegido de propósito: páginas públicas e legais, o heartbeat de
 * presença (/api/presence: roda a cada 60 s e só grava a hora do último sinal; gatear dobraria as leituras do banco),
 * /aceite-termos (onde o aceite é registrado), /login, /register, e /api/webhooks (chamada do provedor, sem sessão).
 *
 * Limite conhecido (documentado em docs/legal-consent.md): quem chama o PostgREST do Supabase diretamente com o
 * próprio JWT não passa pelo Next. O isolamento entre empresas e a RLS continuam valendo; o consentimento é
 * evidência jurídica, não fronteira de segurança dos dados.
 */
export const CONSENT_GATED_PREFIXES = ["/app", "/onboarding", "/admin", "/api/billing"] as const;

export function isConsentGatedPath(pathname: string): boolean {
  return CONSENT_GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type ConsentGateDecision =
  | { action: "allow" }
  | { action: "redirect"; from: string }
  | { action: "deny" };

export interface ConsentGateInput {
  pathname: string;
  search?: string;
  method: string;
  /** Requisição de Server Action do Next (cabeçalho `next-action`). */
  isServerAction: boolean;
  /** `complete` de get_my_legal_consent_status(). Qualquer coisa diferente de `true` é tratada como pendente. */
  complete: unknown;
}

export const CONSENT_REQUIRED_CODE = "LEGAL_CONSENT_REQUIRED";

export function decideConsentGate(input: ConsentGateInput): ConsentGateDecision {
  if (!isConsentGatedPath(input.pathname)) return { action: "allow" };
  if (input.complete === true) return { action: "allow" };

  const method = input.method.toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  if (input.pathname.startsWith("/api/") || input.isServerAction || !isRead) {
    return { action: "deny" };
  }

  // `from` é o caminho pedido; quem redireciona o sanitiza com safeAfterConsentPath (sem open redirect).
  return { action: "redirect", from: input.pathname + (input.search ?? "") };
}
