/**
 * Falhas possíveis da verificação em duas etapas e o texto de cada uma para a pessoa (pt-BR). Módulo puro (sem
 * "server-only" nem "use server"), para poder ser testado e usado pelas Server Actions e pelo servidor.
 */
export type TwoFactorFailure =
  | { ok: false; code: "not_configured" }
  | { ok: false; code: "unavailable" }
  | { ok: false; code: "invalid" }
  | { ok: false; code: "locked"; lockedUntil: string }
  | { ok: false; code: "already_enabled" }
  | { ok: false; code: "not_enabled" };

export function describeFailure(failure: TwoFactorFailure, now = Date.now()): string {
  switch (failure.code) {
    case "invalid":
      return "Código incorreto ou já usado. Confira o aplicativo e tente de novo.";
    case "locked": {
      const minutes = Math.max(1, Math.ceil((new Date(failure.lockedUntil).getTime() - now) / 60000));
      return `Muitas tentativas erradas. Aguarde ${minutes} minuto${minutes > 1 ? "s" : ""} e tente de novo.`;
    }
    case "not_configured":
      return "A verificação em duas etapas ainda não está disponível neste ambiente.";
    case "already_enabled":
      return "A verificação em duas etapas já está ativa.";
    case "not_enabled":
      return "A verificação em duas etapas não está ativa.";
    default:
      return "Não foi possível verificar agora. Tente novamente em instantes.";
  }
}
