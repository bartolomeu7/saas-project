/**
 * Falha de REDE ao falar com a API do Clerk (ex.: "fetch failed" por conexão ociosa derrubada, DNS ou queda curta da
 * internet), e não uma resposta de erro do Clerk. Resposta com status HTTP (401, 404, 429...) NÃO é falha de rede:
 * repetir não adianta e pode piorar (limite de taxa).
 */
export function isTransientClerkNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; message?: unknown; errors?: unknown; cause?: unknown };
  if (typeof e.status === "number" && e.status > 0) return false;
  const text = [
    typeof e.message === "string" ? e.message : "",
    ...(Array.isArray(e.errors) ? e.errors.map((x) => (x && typeof x === "object" ? String((x as { message?: unknown }).message ?? "") : "")) : []),
  ]
    .join(" ")
    .toLowerCase();
  return /fetch failed|econnreset|etimedout|econnrefused|enotfound|eai_again|socket hang up|network/.test(text);
}

const SLEEP = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Repete a chamada só em falha de rede (até `attempts` vezes, com espera crescente); qualquer outro erro sobe na hora. */
export async function withClerkRetry<T>(
  call: () => Promise<T>,
  options: { attempts?: number; delaysMs?: number[]; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delays = options.delaysMs ?? [200, 600];
  const sleep = options.sleep ?? SLEEP;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (!isTransientClerkNetworkError(error) || i === attempts - 1) throw error;
      await sleep(delays[Math.min(i, delays.length - 1)] ?? 200);
    }
  }
  throw lastError;
}
