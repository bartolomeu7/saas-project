/**
 * Chat AI — ditado por voz: utilidades puras (docs/chat-ai/03 §4). O reconhecimento em si é do navegador (Web Speech API);
 * aqui ficam as regras que dá para testar sem navegador: texto da transcrição e mensagens de erro em português.
 */

export const VOICE_LANG = "pt-BR";
/** Tempo máximo de uma fala (segundos); depois disso o microfone para sozinho. */
export const VOICE_MAX_SECONDS = 60;

/** Transcrição pronta para a caixa de texto: sem espaços sobrando e sem ponto final solto. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[.…]+\s*$/u, "")
    .trim();
}

/** Junta o que já estava digitado com o que foi falado. */
export function mergeTranscript(base: string, spoken: string): string {
  const clean = cleanTranscript(spoken);
  if (!clean) return base;
  const trimmedBase = base.replace(/\s+$/, "");
  return trimmedBase ? `${trimmedBase} ${clean}` : clean;
}

/** Mensagem para o usuário a partir do código de erro do reconhecimento. null = não mostrar nada (parada pelo próprio usuário). */
export function voiceErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "O microfone está bloqueado neste navegador. Clique no cadeado ao lado do endereço do site, ative o Microfone e toque no microfone de novo.";
    case "no-speech":
      return "Não ouvi nada. Toque no microfone e fale mais perto.";
    case "audio-capture":
      return "Não encontrei um microfone neste aparelho.";
    case "network":
      return "O serviço de voz do navegador ficou sem conexão. Tente de novo ou escreva a mensagem.";
    case "language-not-supported":
      return "Este navegador não entende português no ditado. Escreva a mensagem.";
    default:
      return "Não consegui ouvir agora. Tente de novo ou escreva a mensagem.";
  }
}

/** Avisado ao começar: o navegador mostra o pedido de permissão na primeira vez. */
export const VOICE_PERMISSION_HINT = "Se o navegador perguntar, toque em Permitir para usar o microfone. Ouvindo, fale agora.";

export const VOICE_UNSUPPORTED_MESSAGE = "Seu navegador não permite ditar por voz. Use o Chrome ou o Edge, ou escreva a mensagem.";

export const VOICE_PRIVACY_NOTE =
  "O ditado usa o reconhecimento de voz do seu navegador, que pode enviar o áudio ao serviço dele (no Chrome, ao Google). A Prime Ges recebe só o texto que você enviar.";
