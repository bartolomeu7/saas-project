/**
 * Resultado de uma operação que já terminou, com sucesso ou erro, sem lançar na hora.
 *
 * Usado pelo middleware para disparar as leituras de proteção (perfil, vaga de sessão, 2FA, consentimento) ao mesmo
 * tempo e só depois decidir, NA MESMA ORDEM de antes. O erro de uma leitura só é relançado quando a decisão chega
 * àquele ponto: se uma decisão anterior já redireciona ou nega, uma falha de uma leitura posterior continua sem efeito
 * (igual ao comportamento de quando as leituras eram feitas uma depois da outra).
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Espera a operação terminar e devolve o resultado, sem nunca rejeitar. */
export function settle<T>(operation: PromiseLike<T>): Promise<Settled<T>> {
  return Promise.resolve(operation).then(
    (value): Settled<T> => ({ ok: true, value }),
    (error: unknown): Settled<T> => ({ ok: false, error })
  );
}

/** Devolve o valor ou relança o erro guardado. */
export function valueOrThrow<T>(result: Settled<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

/**
 * Garante que uma leitura que DEVERIA ter sido disparada realmente foi. Se faltar, é erro de lógica: o código que chama
 * deve falhar fechado (lançar), nunca pular a verificação em silêncio.
 */
export function expectRead<T>(result: Settled<T> | null, name: string): Settled<T> {
  if (result === null) throw new Error(`Leitura de proteção "${name}" não foi executada.`);
  return result;
}
