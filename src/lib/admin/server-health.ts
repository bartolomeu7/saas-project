/** Saúde do processo do site, para o cartão "Servidor" do painel. Só números do próprio processo (nada de segredo). */
export interface ServerHealth {
  uptime: string;
  memoryMb: number;
}

export function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} d ${hours % 24} h`;
  if (hours > 0) return `${hours} h ${minutes % 60} min`;
  return `${minutes} min`;
}

export function readServerHealth(): ServerHealth {
  return { uptime: formatUptime(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024) };
}

/** Roda a consulta e devolve também quanto ela levou (ms). */
export async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const began = performance.now();
  const result = await run();
  return [result, Math.round(performance.now() - began)];
}
