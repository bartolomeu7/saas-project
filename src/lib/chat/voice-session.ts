/**
 * Chat AI — sessão de ditado CONTÍNUO (pura, testável sem navegador).
 * Regra do dono: clicou no microfone, ele escuta até clicar de novo; pausar para pensar NÃO encerra.
 *
 * O navegador (Web Speech API) encerra sozinho o reconhecimento depois de uns segundos de silêncio. Aqui ficam as decisões
 * de o que fazer quando isso acontece: reiniciar em silêncio, parar por erro de verdade, ou desistir se o microfone cai
 * em ciclo.
 */

/** Tempo máximo escutando numa tacada (segurança contra microfone esquecido ligado). */
export const VOICE_SESSION_MAX_SECONDS = 600;
/** Reinício muito rápido seguido de outro: sinal de microfone com problema. */
const FAST_END_MS = 700;
const MAX_FAST_ENDS = 4;

/** Erros em que continuar tentando não adianta. */
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "network"]);

export interface VoiceSessionState {
  /** o usuário ainda quer ouvir (não clicou em parar) */
  wanting: boolean;
  /** texto já confirmado pelo navegador nesta gravação */
  committed: string;
  /** trecho parcial da fala em andamento */
  interim: string;
  /** términos rápidos seguidos */
  fastEnds: number;
}

export const newVoiceSession = (): VoiceSessionState => ({ wanting: true, committed: "", interim: "", fastEnds: 0 });

const join = (a: string, b: string) => {
  const left = a.replace(/\s+$/, "");
  const right = b.trim();
  return left && right ? `${left} ${right}` : left || right;
};

/** O que mostrar na caixa agora (confirmado + parcial). */
export const displayText = (s: VoiceSessionState): string => join(s.committed, s.interim);

/** Chegou texto do navegador. Parcial substitui o parcial anterior; final é confirmado e não se repete. */
export function applyResult(s: VoiceSessionState, text: string, isFinal: boolean): VoiceSessionState {
  const clean = text.trim();
  if (isFinal) return { ...s, committed: join(s.committed, clean), interim: "", fastEnds: 0 };
  return { ...s, interim: clean, fastEnds: 0 };
}

/** O usuário clicou em parar: o que estava parcial vale como confirmado (nada se perde). */
export function stopByUser(s: VoiceSessionState): VoiceSessionState {
  return { ...s, wanting: false, committed: join(s.committed, s.interim), interim: "" };
}

export type EndDecision =
  | { action: "restart"; state: VoiceSessionState }
  | { action: "stop"; state: VoiceSessionState; reason: "user" | "error" | "loop"; errorCode?: string };

/**
 * O navegador encerrou o reconhecimento. Decide: reiniciar (o usuário ainda quer ouvir), parar (ele pediu ou houve erro
 * fatal) ou desistir (reinícios rápidos em ciclo). `msSinceStart` = quanto durou esta rodada.
 */
export function decideOnEnd(s: VoiceSessionState, input: { msSinceStart: number; errorCode?: string }): EndDecision {
  // trecho parcial que o navegador não chegou a finalizar vira confirmado
  const flushed: VoiceSessionState = { ...s, committed: join(s.committed, s.interim), interim: "" };
  if (!s.wanting) return { action: "stop", state: flushed, reason: "user" };
  if (input.errorCode && FATAL_ERRORS.has(input.errorCode)) return { action: "stop", state: { ...flushed, wanting: false }, reason: "error", errorCode: input.errorCode };

  const fast = input.msSinceStart < FAST_END_MS;
  const fastEnds = fast ? s.fastEnds + 1 : 0;
  if (fastEnds >= MAX_FAST_ENDS) return { action: "stop", state: { ...flushed, wanting: false, fastEnds }, reason: "loop" };
  // "no-speech", "aborted" e fim sem erro (silêncio): segue ouvindo
  return { action: "restart", state: { ...flushed, fastEnds } };
}

export const VOICE_LOOP_MESSAGE = "O microfone não ficou ouvindo. Toque nele de novo ou escreva a mensagem.";
export const VOICE_LIMIT_MESSAGE = "Parei de ouvir por segurança depois de muito tempo. Toque no microfone se quiser continuar.";
