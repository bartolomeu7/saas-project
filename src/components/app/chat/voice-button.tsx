"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VOICE_LANG, VOICE_PERMISSION_HINT, VOICE_UNSUPPORTED_MESSAGE, voiceErrorMessage } from "@/lib/chat/voice.ts";
import {
  applyResult,
  decideOnEnd,
  displayText,
  newVoiceSession,
  stopByUser,
  VOICE_LIMIT_MESSAGE,
  VOICE_LOOP_MESSAGE,
  VOICE_SESSION_MAX_SECONDS,
  type VoiceSessionState,
} from "@/lib/chat/voice-session.ts";

/**
 * Chat AI — botão de ditado contínuo (Web Speech API do navegador). Clicou: escuta até clicar de novo (pausas não
 * encerram: o navegador pára sozinho no silêncio e aqui ele é reiniciado). A fala vira TEXTO na caixa, editável; nada é
 * enviado sozinho e o áudio não passa pela Prime Ges.
 */

interface RecognitionResultItem {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionResultItem;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const PRIVACY_SEEN_KEY = "primeges-chat-voice-privacy-seen";

export function VoiceButton({
  disabled,
  onTranscript,
  onStart,
  onEnd,
  onMessage,
  privacyNote,
}: {
  disabled?: boolean;
  /** texto reconhecido nesta gravação até agora (confirmado + parcial) */
  onTranscript: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
  /** aviso para a pessoa (erro ou estado), em português */
  onMessage: (text: string) => void;
  /** mostrado uma vez por aparelho, na primeira vez que o microfone é usado */
  privacyNote: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const sessionRef = useRef<VoiceSessionState>(newVoiceSession());
  const startedAtRef = useRef(0);
  const lastErrorRef = useRef<string | undefined>(undefined);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRoundRef = useRef<() => void>(() => {});

  useEffect(() => {
    setSupported(getCtor() !== null);
    return () => {
      sessionRef.current = { ...sessionRef.current, wanting: false };
      recRef.current?.abort();
      if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, []);

  const finish = useCallback(() => {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    recRef.current = null;
    setListening(false);
    onTranscript(displayText(sessionRef.current));
    onEnd();
  }, [onEnd, onTranscript]);

  // uma rodada de reconhecimento; ao terminar, decide se reinicia
  const runRound = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = VOICE_LANG;
    rec.interimResults = true;
    rec.continuous = false; // reiniciamos nós mesmos: mais estável que continuous no Android
    rec.maxAlternatives = 1;
    lastErrorRef.current = undefined;
    rec.onstart = () => {
      startedAtRef.current = Date.now();
    };
    rec.onresult = (event) => {
      let text = "";
      let final = true;
      for (let i = 0; i < event.results.length; i += 1) {
        const r = event.results[i]!;
        text += r[0].transcript;
        if (!r.isFinal) final = false;
      }
      sessionRef.current = applyResult(sessionRef.current, text, final);
      onTranscript(displayText(sessionRef.current));
    };
    rec.onerror = (event) => {
      lastErrorRef.current = event.error;
      const message = voiceErrorMessage(event.error);
      // "no-speech" no meio de uma gravação contínua é só silêncio: não incomoda a pessoa
      if (message && event.error !== "no-speech") onMessage(message);
    };
    rec.onend = () => {
      const decision = decideOnEnd(sessionRef.current, {
        msSinceStart: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        errorCode: lastErrorRef.current,
      });
      sessionRef.current = decision.state;
      if (decision.action === "restart") {
        recRef.current = null;
        restartTimerRef.current = setTimeout(() => runRoundRef.current(), 120);
        return;
      }
      if (decision.reason === "loop") onMessage(VOICE_LOOP_MESSAGE);
      finish();
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      onMessage("Não consegui iniciar o microfone agora. Tente de novo.");
      sessionRef.current = { ...sessionRef.current, wanting: false };
      finish();
    }
  }, [finish, onMessage, onTranscript]);

  useEffect(() => {
    runRoundRef.current = runRound;
  }, [runRound]);

  const start = useCallback(() => {
    if (!getCtor()) {
      onMessage(VOICE_UNSUPPORTED_MESSAGE);
      return;
    }
    sessionRef.current = newVoiceSession();
    setListening(true);
    onStart();
    let note = "Ouvindo. Fale à vontade e toque no microfone de novo quando terminar.";
    try {
      if (!window.localStorage.getItem(PRIVACY_SEEN_KEY)) {
        window.localStorage.setItem(PRIVACY_SEEN_KEY, "1");
        note = `${VOICE_PERMISSION_HINT} ${privacyNote}`;
      }
    } catch {
      // sem armazenamento: mostra o aviso curto de sempre
    }
    onMessage(note);
    limitTimerRef.current = setTimeout(() => {
      sessionRef.current = stopByUser(sessionRef.current);
      onMessage(VOICE_LIMIT_MESSAGE);
      recRef.current?.stop();
    }, VOICE_SESSION_MAX_SECONDS * 1000);
    runRound();
  }, [onMessage, onStart, privacyNote, runRound]);

  const stop = useCallback(() => {
    sessionRef.current = stopByUser(sessionRef.current);
    onTranscript(displayText(sessionRef.current));
    if (recRef.current) recRef.current.stop();
    else finish(); // estava entre dois reinícios
  }, [finish, onTranscript]);

  // Esc para de ouvir
  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [listening, stop]);

  if (!supported) {
    return (
      <Button type="button" variant="outline" disabled className="h-12 w-12 shrink-0 p-0" title={VOICE_UNSUPPORTED_MESSAGE} aria-label="Ditar mensagem (indisponível neste navegador)">
        <Mic className="h-5 w-5 opacity-50" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={listening ? "default" : "outline"}
      disabled={disabled && !listening}
      onClick={listening ? stop : start}
      aria-pressed={listening}
      aria-label={listening ? "Parar de ouvir" : "Ditar mensagem por voz"}
      title={listening ? "Parar de ouvir (Esc)" : "Ditar mensagem por voz"}
      className={cn("h-12 w-12 shrink-0 p-0", listening && "bg-destructive text-destructive-foreground hover:bg-destructive/90 motion-safe:animate-pulse")}
    >
      {listening ? <Square className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
    </Button>
  );
}
