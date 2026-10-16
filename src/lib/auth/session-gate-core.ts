/**
 * Núcleo do limite de sessões simultâneas: regras de decisão PURAS (sem I/O, sem "server-only", sem Clerk/Supabase),
 * para poderem ser usadas pelo middleware e testadas por unidade com dependências falsas.
 *
 * Fontes de verdade (nenhuma vem do navegador):
 *  - identidade da sessão: o `sid` do token que o Clerk assinou (o middleware/layout o recebe de `auth()`); ele diz QUAL
 *    sessão é — nunca QUANTAS existem;
 *  - quantas sessões estão ativas: a API do Clerk, consultada no servidor (`getSessionList({ status: "active" })`);
 *  - a decisão (aceitar/recusar): o banco, de forma atômica por usuário (register_session_slot, somente service_role).
 *
 * Comportamento explícito diante de falhas (o mesmo em toda a aplicação):
 *  - sessão JÁ aceita antes (vaga registrada) => segue acessando, mesmo com o Clerk fora do ar (nunca derrubamos quem já
 *    foi validado por causa de uma falha nossa);
 *  - sessão ainda NÃO validada + falha/timeout do Clerk ou do registro => "unverified": acesso negado só a essa sessão,
 *    de forma temporária, com a mensagem "não foi possível verificar" e botão de nova tentativa (nenhuma vaga é
 *    consumida e a conta não fica bloqueada);
 *  - gate não instalado no banco (migration ainda não aplicada) => "allowed", registrado em log: é a fase de expansão
 *    do deploy, não uma falha;
 *  - nunca se libera acesso a uma sessão não validada "em silêncio".
 */

export const SESSION_LIMIT_PATH = "/acesso-sessoes";
export const SESSION_LIMIT_MESSAGE =
  "Você atingiu o limite de sessões simultâneas permitido pela sua conta. Encerre uma sessão ativa ou entre em contato com o suporte para obter ajuda.";
export const SESSION_UNVERIFIED_MESSAGE =
  "Não foi possível verificar as sessões da sua conta agora. Isso é temporário e nada foi bloqueado: tente novamente em instantes.";
export const SESSION_LIMIT_CODE = "SESSION_LIMIT_REACHED";
export const SESSION_UNVERIFIED_CODE = "SESSION_UNVERIFIED";

export type SessionGateResult = "allowed" | "blocked" | "unverified";

export type SlotState = "allowed" | "blocked" | "unknown";

export interface SlotStatus {
  state: SlotState;
  /** Há quantos segundos o estado foi verificado pela última vez (só quando a sessão já existe no registro). */
  verifiedAgeSeconds?: number;
}

export interface ActiveSessions {
  ids: string[];
  /** false quando a lista do Clerk veio truncada (mais sessões que o limite da página): o banco não poda nada. */
  complete: boolean;
}

export type RegisterResult = "allowed" | "blocked" | "invalid";

/** Marca erro de "recurso do gate ainda não existe no banco" (função ausente): fase de expansão do deploy. */
export class GateNotProvisionedError extends Error {
  constructor() {
    super("gate de sessões não instalado no banco");
    this.name = "GateNotProvisionedError";
  }
}

export interface SessionGateDeps {
  /** Lê o estado da vaga desta sessão (barato, com o token do próprio usuário). */
  readStatus(): Promise<SlotStatus>;
  /** Sessões ativas do usuário no Clerk (servidor). */
  listActiveSessions(): Promise<ActiveSessions>;
  /** Registro atômico no banco (service_role). */
  register(activeIds: string[], listComplete: boolean): Promise<RegisterResult>;
  log?(event: string, detail?: string): void;
}

export interface SessionGateOptions {
  /** Revalida uma sessão recusada depois deste tempo (uma vaga pode ter sido liberada). */
  recheckBlockedAfterSeconds: number;
  /** Teto de tempo de cada chamada externa (Clerk / banco). */
  timeoutMs: number;
  /** Tentativas extras para a chamada ao Clerk (falhas transitórias). */
  clerkRetries: number;
}

export const DEFAULT_GATE_OPTIONS: SessionGateOptions = {
  recheckBlockedAfterSeconds: 20,
  timeoutMs: 4000,
  clerkRetries: 1,
};

export class GateTimeoutError extends Error {
  constructor(what: string) {
    super(`tempo esgotado: ${what}`);
    this.name = "GateTimeoutError";
  }
}

/** Corre a promessa contra um prazo. A chamada original não é cancelada (não há como), mas o gate para de esperar. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GateTimeoutError(what)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function listWithRetry(deps: SessionGateDeps, options: SessionGateOptions): Promise<ActiveSessions> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.clerkRetries; attempt++) {
    try {
      return await withTimeout(deps.listActiveSessions(), options.timeoutMs, "listar sessões no Clerk");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Decide o acesso de UMA sessão. Não confia em nenhum contador vindo do cliente: quem decide é `register` (banco).
 * `reason` serve só para log/auditoria interna (nunca contém tokens, cookies ou ids de sessão).
 */
export async function decideSessionAccess(
  deps: SessionGateDeps,
  options: SessionGateOptions = DEFAULT_GATE_OPTIONS
): Promise<{ result: SessionGateResult; reason: string }> {
  // 1. Caminho comum: a sessão já foi validada antes.
  try {
    const status = await withTimeout(deps.readStatus(), options.timeoutMs, "ler vaga da sessão");
    if (status.state === "allowed") return { result: "allowed", reason: "slot_allowed" };
    if (status.state === "blocked" && (status.verifiedAgeSeconds ?? Infinity) < options.recheckBlockedAfterSeconds) {
      return { result: "blocked", reason: "slot_blocked" };
    }
  } catch (error) {
    if (error instanceof GateNotProvisionedError) {
      deps.log?.("gate_not_provisioned", "status");
      return { result: "allowed", reason: "gate_not_provisioned" };
    }
    // Não conseguiu LER o estado: segue para a verificação completa (que decide ou falha de forma explícita).
    deps.log?.("status_unavailable", error instanceof Error ? error.name : "erro");
  }

  // 2. Primeira vez, recusada há tempo, ou leitura indisponível: confere no Clerk e decide no banco.
  let active: ActiveSessions;
  try {
    active = await listWithRetry(deps, options);
  } catch (error) {
    deps.log?.("clerk_unavailable", error instanceof Error ? error.name : "erro");
    return { result: "unverified", reason: error instanceof GateTimeoutError ? "clerk_timeout" : "clerk_unavailable" };
  }

  try {
    const decision = await withTimeout(deps.register(active.ids, active.complete), options.timeoutMs, "registrar sessão");
    if (decision === "allowed") return { result: "allowed", reason: "registered" };
    if (decision === "blocked") return { result: "blocked", reason: "limit_reached" };
    // "invalid": o Clerk não lista esta sessão como ativa (revogada/expirada ou ainda propagando). Não ocupa vaga e
    // não é "bloqueio por limite": pede nova tentativa.
    return { result: "unverified", reason: "session_not_listed" };
  } catch (error) {
    if (error instanceof GateNotProvisionedError) {
      deps.log?.("gate_not_provisioned", "register");
      return { result: "allowed", reason: "gate_not_provisioned" };
    }
    deps.log?.("register_unavailable", error instanceof Error ? error.name : "erro");
    return { result: "unverified", reason: error instanceof GateTimeoutError ? "register_timeout" : "register_unavailable" };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Middleware: só a LEITURA barata do estado decide o que o middleware faz; a verificação completa fica no layout.
// ---------------------------------------------------------------------------------------------------------------

export type MiddlewareSessionAction = "pass" | "redirect_limit" | "redirect_verify" | "deny_limit" | "deny_unverified";

/**
 * - allowed => segue.
 * - blocked (visto há pouco) => páginas vão para /acesso-sessoes; Server Actions/APIs recebem 403 (sem corpo sensível).
 * - unknown => páginas seguem (o layout verifica no Clerk e registra); Server Actions/APIs recebem 403
 *   SESSION_UNVERIFIED (uma sessão nunca validada não executa ações antes de passar pela página).
 */
export function middlewareSessionAction(
  status: SlotStatus,
  isPage: boolean,
  recheckBlockedAfterSeconds = DEFAULT_GATE_OPTIONS.recheckBlockedAfterSeconds
): MiddlewareSessionAction {
  if (status.state === "allowed") return "pass";
  if (status.state === "blocked") {
    // recusada há tempo: a página reavalia (uma vaga pode ter sido liberada); ações continuam negadas até lá.
    if (isPage && (status.verifiedAgeSeconds ?? Infinity) >= recheckBlockedAfterSeconds) return "pass";
    return isPage ? "redirect_limit" : "deny_limit";
  }
  return isPage ? "pass" : "deny_unverified";
}

/** Interpreta a resposta bruta de session_slot_status (nunca confia em tipos: valores inesperados viram "unknown"). */
export function parseSlotStatus(raw: unknown): SlotStatus {
  if (!raw || typeof raw !== "object") return { state: "unknown" };
  const o = raw as { state?: unknown; verified_age_seconds?: unknown };
  const state: SlotState = o.state === "allowed" || o.state === "blocked" ? o.state : "unknown";
  const age = typeof o.verified_age_seconds === "number" && Number.isFinite(o.verified_age_seconds) ? o.verified_age_seconds : undefined;
  return { state, verifiedAgeSeconds: age };
}

/** Erro de PostgREST/Postgres que significa "a função não existe" (migration ainda não aplicada). */
export function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function|function .* does not exist/i.test(error.message ?? "");
}
