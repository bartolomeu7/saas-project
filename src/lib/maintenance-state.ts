import { EMPTY_MAINTENANCE_STATE, parseMaintenanceState, type MaintenanceState } from "./maintenance-gate.ts";

/**
 * Leitura do estado da manutenção (função `get_maintenance_public()` do banco) para o middleware, o layout do app,
 * a tela de manutenção e a rota `/api/maintenance/status`.
 *
 * Regras de segurança do recurso:
 * - CACHE curto (12 s): o banco não é consultado a cada clique de cada usuário; uma chamada em andamento é compartilhada.
 * - FALHA ABERTA: se a consulta falha (rede, banco, formato), o site NÃO cai por causa do recurso de manutenção. Se
 *   havia uma manutenção ATIVA conhecida, ela é mantida por até 5 minutos (para um tropeço do banco não "reabrir" o sistema
 *   no meio de uma migration); passado isso, volta a "sem manutenção".
 * - Timeout curto (1,5 s): o middleware nunca fica esperando o banco.
 */

const FRESH_MS = 12_000;
const KEEP_ACTIVE_WHEN_FAILING_MS = 5 * 60_000;
const TIMEOUT_MS = 1_500;

export interface MaintenanceReaderDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** devolve URL base do PostgREST (ex.: http://gateway:8080) e a chave anon; vazio = recurso desligado */
  config?: () => { baseUrl: string; anonKey: string } | null;
}

export function createMaintenanceReader(deps: MaintenanceReaderDeps = {}) {
  const now = deps.now ?? (() => Date.now());
  const config =
    deps.config ??
    (() => {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      return baseUrl && anonKey ? { baseUrl, anonKey } : null;
    });

  let cache: { at: number; state: MaintenanceState } | null = null;
  let lastActiveAt = 0;
  let inflight: Promise<MaintenanceState> | null = null;

  async function load(): Promise<MaintenanceState> {
    const cfg = config();
    if (!cfg) return EMPTY_MAINTENANCE_STATE;
    const doFetch = deps.fetchImpl ?? fetch;
    try {
      const response = await doFetch(`${cfg.baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/get_maintenance_public`, {
        method: "POST",
        headers: { apikey: cfg.anonKey, authorization: `Bearer ${cfg.anonKey}`, "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = parseMaintenanceState(await response.json());
      if (state.active) lastActiveAt = now();
      return state;
    } catch {
      // falha aberta, mas sem "reabrir" no meio de uma manutenção ativa conhecida
      if (cache?.state.active && now() - lastActiveAt < KEEP_ACTIVE_WHEN_FAILING_MS) return cache.state;
      return EMPTY_MAINTENANCE_STATE;
    }
  }

  async function read(): Promise<MaintenanceState> {
    if (cache && now() - cache.at < FRESH_MS) return cache.state;
    if (!inflight) {
      inflight = load()
        .then((state) => {
          cache = { at: now(), state };
          return state;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  return { read, reset: () => { cache = null; inflight = null; lastActiveAt = 0; } };
}

const sharedReader = createMaintenanceReader();

/** Estado atual da manutenção (com cache e falha aberta). */
export function getMaintenanceState(): Promise<MaintenanceState> {
  return sharedReader.read();
}
