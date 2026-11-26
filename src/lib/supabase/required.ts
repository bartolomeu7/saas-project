/**
 * Falha de consulta nunca vira zero nem lista vazia: o erro sobe e a página mostra "tentar de novo".
 * `what` completa a frase "Não foi possível …".
 */
export function required<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`Não foi possível ${what}: ${result.error?.message ?? "sem resposta"}`);
  }
  return result.data;
}
