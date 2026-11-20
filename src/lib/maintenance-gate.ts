/**
 * Regras puras (sem banco, sem rede, sem React) da manutenção programada. Rodam no middleware (Edge), nas telas e nos testes.
 *
 * Níveis: `notice` só avisa; `read_only` libera consulta e bloqueia gravação; `blocked` troca o sistema pela tela de manutenção.
 * O super administrador continua entrando para acompanhar e encerrar (hoje, com o interruptor antigo, nem ele entra).
 */

export type MaintenanceLevel = "notice" | "read_only" | "blocked";

export interface MaintenanceWindowPublic {
  id: string;
  title: string;
  message: string;
  level: MaintenanceLevel;
  startsAt: string;
  expectedEndAt: string;
  startedAt: string | null;
  contactText: string | null;
}

export interface MaintenanceState {
  active: MaintenanceWindowPublic | null;
  upcoming: MaintenanceWindowPublic | null;
  /** hora do servidor do banco quando o estado foi lido (para a contagem não depender do relógio do aparelho) */
  serverNow: string | null;
}

export const EMPTY_MAINTENANCE_STATE: MaintenanceState = { active: null, upcoming: null, serverNow: null };

const LEVELS: readonly MaintenanceLevel[] = ["notice", "read_only", "blocked"];

function parseWindow(raw: unknown): MaintenanceWindowPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const level = row.level as MaintenanceLevel;
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.message !== "string" || !LEVELS.includes(level)) return null;
  if (typeof row.starts_at !== "string" || typeof row.expected_end_at !== "string") return null;
  if (Number.isNaN(Date.parse(row.starts_at)) || Number.isNaN(Date.parse(row.expected_end_at))) return null;
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    level,
    startsAt: row.starts_at,
    expectedEndAt: row.expected_end_at,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    contactText: typeof row.contact_text === "string" && row.contact_text.trim() ? row.contact_text : null,
  };
}

/** Resposta de `get_maintenance_public()` → estado. Qualquer coisa fora do formato vira "sem manutenção" (falha aberta). */
export function parseMaintenanceState(raw: unknown): MaintenanceState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_MAINTENANCE_STATE;
  const row = raw as Record<string, unknown>;
  return {
    active: parseWindow(row.active),
    upcoming: parseWindow(row.upcoming),
    serverNow: typeof row.server_now === "string" && !Number.isNaN(Date.parse(row.server_now)) ? row.server_now : null,
  };
}

/** Rotas do produto que a manutenção bloqueia (o resto — home, login, termos — continua público). */
const PROFILE_GATED_PREFIXES = ["/app", "/admin", "/onboarding"];
const OTHER_GATED_PREFIXES = ["/conta", "/acesso-sessoes", "/aceite-termos", "/verificacao-2fa"];
/** Sempre liberadas: monitoramento, o próprio estado da manutenção e a tela de manutenção. */
const ALWAYS_OPEN = ["/api/health", "/api/maintenance", "/manutencao"];

const startsWithPath = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

export function isMaintenanceAlwaysOpen(pathname: string): boolean {
  return ALWAYS_OPEN.some((path) => startsWithPath(pathname, path));
}

/** O caminho precisa saber se quem pede é super administrador (só estas rotas leem o perfil no middleware). */
export function needsRoleToDecide(pathname: string): boolean {
  return PROFILE_GATED_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
}

export function isMaintenanceGatedPath(pathname: string): boolean {
  if (isMaintenanceAlwaysOpen(pathname)) return false;
  return (
    PROFILE_GATED_PREFIXES.some((prefix) => startsWithPath(pathname, prefix)) ||
    OTHER_GATED_PREFIXES.some((prefix) => startsWithPath(pathname, prefix)) ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

export type MaintenanceDecision =
  | { action: "allow" }
  /** mostrar a tela de manutenção no lugar da página */
  | { action: "page" }
  /** recusar com 503 (gravação, API, ação do servidor, navegação interna do app) */
  | { action: "deny" }
  /** ainda não dá para decidir: falta saber se é super administrador */
  | { action: "needs_role" };

export interface MaintenanceRequestInfo {
  pathname: string;
  method: string;
  isServerAction: boolean;
  /** navegação interna do app (busca de dados da página): em manutenção total deve falhar para o navegador recarregar */
  isRsc: boolean;
}

/**
 * Decide o que fazer com uma requisição durante uma manutenção ATIVA.
 * `isSuperAdmin`: true/false quando se sabe; null quando ainda não foi lido (então só as rotas que não dependem disso decidem).
 */
export function decideMaintenance(
  active: Pick<MaintenanceWindowPublic, "level"> | null,
  request: MaintenanceRequestInfo,
  isSuperAdmin: boolean | null
): MaintenanceDecision {
  if (!active || active.level === "notice") return { action: "allow" };
  if (!isMaintenanceGatedPath(request.pathname)) return { action: "allow" };

  if (needsRoleToDecide(request.pathname) && isSuperAdmin === null) return { action: "needs_role" };
  if (isSuperAdmin === true) return { action: "allow" };

  const method = request.method.toUpperCase();
  const isSafeRead = (method === "GET" || method === "HEAD") && !request.isServerAction;
  const isApi = request.pathname === "/api" || request.pathname.startsWith("/api/");

  if (active.level === "read_only") {
    return isSafeRead ? { action: "allow" } : { action: "deny" };
  }
  // blocked
  if (isApi || !isSafeRead || request.isRsc) return { action: "deny" };
  return { action: "page" };
}

/** Segundos para o `Retry-After`: até o fim previsto (mínimo 60 s, máximo 1 h), para o navegador/monitor voltar na hora certa. */
export function retryAfterSeconds(expectedEndAt: string, now: number = Date.now()): number {
  const end = Date.parse(expectedEndAt);
  if (Number.isNaN(end)) return 600;
  return Math.max(60, Math.min(3600, Math.ceil((end - now) / 1000)));
}

/** Minutos restantes até o fim previsto (pode ser negativo se já passou). */
export function minutesUntil(iso: string, now: number = Date.now()): number {
  return Math.ceil((Date.parse(iso) - now) / 60000);
}

/** "1 h 30 min", "45 min", "agora": duração legível em português. */
export function formatDurationPt(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 1) return "menos de 1 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const MAINTENANCE_LEVEL_LABELS: Record<MaintenanceLevel, string> = {
  notice: "Só aviso",
  read_only: "Somente leitura",
  blocked: "Sistema indisponível",
};

/** O que o cliente vai viver, em uma frase (usada na faixa de aviso). */
export const MAINTENANCE_LEVEL_IMPACT: Record<MaintenanceLevel, string> = {
  notice: "O sistema continua funcionando, mas pode ficar mais lento.",
  read_only: "Você poderá consultar tudo, mas não gravar nada durante a manutenção.",
  blocked: "O sistema ficará indisponível durante a manutenção. Salve o que estiver fazendo antes.",
};

const SP_INPUT_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Instante → valor de campo `datetime-local` no horário de São Paulo ("2026-11-22T22:00"). */
export function toSaoPauloInputValue(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return SP_INPUT_FORMAT.format(date).replace(" ", "T");
}
