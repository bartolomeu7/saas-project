/**
 * Nível de segurança da conta, mostrado em Configurações → Segurança.
 *
 * Função pura (sem React nem Clerk) para poder ser testada em Node. É um resumo para a pessoa saber o que ainda
 * pode melhorar, não uma garantia: cada item vem de um fato que o Clerk informa sobre a conta.
 */

export interface SecuritySignals {
  /** A conta tem senha própria (quem só entra com Google/Discord/Microsoft pode não ter). */
  hasPassword: boolean;
  /** Há pelo menos um e-mail verificado. */
  hasVerifiedEmail: boolean;
  /** Há pelo menos um telefone verificado. */
  hasVerifiedPhone: boolean;
  /** Verificação em duas etapas por app autenticador está ativa. */
  twoFactorEnabled: boolean;
  /** Códigos de backup foram gerados (recuperação se perder o celular). */
  hasBackupCodes: boolean;
}

export type SecurityLevelName = "basic" | "good" | "strong";

export interface SecurityCheck {
  id: "email" | "password" | "phone" | "twoFactor" | "backup";
  label: string;
  done: boolean;
  /** Pontos que o item vale no total de 100. */
  points: number;
  /** O que fazer quando ainda não está feito. */
  hint: string;
}

export interface SecurityLevel {
  name: SecurityLevelName;
  label: string;
  score: number;
  checks: SecurityCheck[];
}

const LABELS: Record<SecurityLevelName, string> = { basic: "Básico", good: "Bom", strong: "Forte" };

export function computeSecurityLevel(signals: SecuritySignals): SecurityLevel {
  const checks: SecurityCheck[] = [
    { id: "email", label: "E-mail verificado", done: signals.hasVerifiedEmail, points: 20, hint: "Confirme o seu e-mail para poder recuperar a conta." },
    { id: "password", label: "Senha própria definida", done: signals.hasPassword, points: 20, hint: "Crie uma senha para entrar mesmo sem as contas sociais." },
    { id: "phone", label: "Telefone verificado", done: signals.hasVerifiedPhone, points: 10, hint: "Cadastre e confirme um telefone." },
    { id: "twoFactor", label: "Verificação em duas etapas", done: signals.twoFactorEnabled, points: 40, hint: "Ative com o Google Authenticator: protege mesmo se a senha vazar." },
    { id: "backup", label: "Códigos de backup guardados", done: signals.twoFactorEnabled && signals.hasBackupCodes, points: 10, hint: "Gere os códigos para entrar se perder o celular." },
  ];
  const score = checks.reduce((sum, check) => sum + (check.done ? check.points : 0), 0);
  // Sem a verificação em duas etapas a conta nunca passa de "Bom", por mais itens que tenha.
  const name: SecurityLevelName = !signals.twoFactorEnabled ? (score >= 40 ? "good" : "basic") : score >= 80 ? "strong" : "good";
  return { name, label: LABELS[name], score, checks };
}
