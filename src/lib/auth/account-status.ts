/**
 * Estado "conta sem acesso ao produto": profiles.status diferente de `active`
 * (inactive ou suspended). O Clerk continua sendo só identidade/sessão; quem
 * decide se a conta pode usar o Prime Ges é profiles.status.
 *
 * No banco a regra é uma só: current_profile_user_id() só devolve identidade para
 * perfil ativo, então RLS e RPCs já negam tudo. Aqui ficam as peças que o app usa
 * para reagir de forma clara em vez de parecer "sessão expirada".
 *
 * Sem "server-only": usado pelo middleware (Edge) e por componentes.
 */

/** Destino de quem está autenticado no Clerk, mas bloqueado pelo Prime Ges. */
export const ACCOUNT_BLOCKED_PATH = "/acesso-indisponivel";

export const ACCOUNT_BLOCKED_MESSAGE =
  "Seu acesso ao Prime Ges está temporariamente indisponível.";

/**
 * Lançado por getClerkInternalUserId() quando o perfil existe mas não está
 * ativo. Quem chama decide: layouts redirecionam para ACCOUNT_BLOCKED_PATH,
 * route handlers respondem 403 e server actions devolvem a mensagem acima.
 */
export class AccountInactiveError extends Error {
  constructor() {
    super("ACCOUNT_INACTIVE");
    this.name = "AccountInactiveError";
  }
}
