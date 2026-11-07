/**
 * Núcleo do health check (puro e testável): recebe a sonda do banco por injeção.
 * Nunca devolve mensagens de erro nem detalhes internos — só "ok"/"fail".
 */
export type HealthStatus = "ok" | "degraded";

export interface HealthReport {
  status: HealthStatus;
  version: string;
  checks: { database: "ok" | "fail" };
  at: string;
}

export const HEALTH_DB_TIMEOUT_MS = 3000;

/** Executa a sonda com limite de tempo; qualquer erro, retorno `false` ou estouro vira "fail". */
export async function checkWithTimeout(
  probe: () => Promise<boolean>,
  timeoutMs: number = HEALTH_DB_TIMEOUT_MS
): Promise<"ok" | "fail"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const ok = await Promise.race([probe().catch(() => false), timeout]);
    return ok ? "ok" : "fail";
  } catch {
    return "fail";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function buildHealthReport(
  probeDatabase: () => Promise<boolean>,
  version: string,
  now: Date = new Date(),
  timeoutMs: number = HEALTH_DB_TIMEOUT_MS
): Promise<HealthReport> {
  const database = await checkWithTimeout(probeDatabase, timeoutMs);
  return {
    status: database === "ok" ? "ok" : "degraded",
    version,
    checks: { database },
    at: now.toISOString(),
  };
}
