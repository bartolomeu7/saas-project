"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VOICE_LANG, VOICE_MAX_SECONDS, VOICE_UNSUPPORTED_MESSAGE, voiceErrorMessage } from "@/lib/chat/voice.ts";

/**
 * Chat AI — botão de ditado (Web Speech API do navegador). Nunca envia nada sozinho: a fala vira TEXTO na caixa de
 * mensagem, editável, e só vai quando a pessoa clica em enviar. O áudio não passa pela Prime Ges (fica com o navegador).
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

export function VoiceButton({
  disabled,
  onTranscript,
  onStart,
  onEnd,
  onMessage,
}: {
  disabled?: boolean;
  /** texto reconhecido até agora (parcial ou final) */
  onTranscript: (text: string, final: boolean) => void;
  onStart: () => void;
  onEnd: () => void;
  /** aviso para a pessoa (erro ou estado), em português */
  onMessage: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(getCtor() !== null);
    return () => {
      recRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      onMessage(VOICE_UNSUPPORTED_MESSAGE);
      return;
    }
    const rec = new Ctor();
    rec.lang = VOICE_LANG;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setListening(true);
      onStart();
      onMessage("Ouvindo. Fale agora.");
    };
    rec.onresult = (event) => {
      let text = "";
      let final = true;
      for (let i = 0; i < event.results.length; i += 1) {
        const r = event.results[i]!;
        text += r[0].transcript;
        if (!r.isFinal) final = false;
      }
      onTranscript(text, final);
    };
    rec.onerror = (event) => {
      const message = voiceErrorMessage(event.error);
      if (message) onMessage(message);
    };
    rec.onend = () => {
      setListening(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      recRef.current = null;
      onEnd();
    };
    recRef.current = rec;
    try {
      rec.start();
      timerRef.current = setTimeout(() => rec.stop(), VOICE_MAX_SECONDS * 1000);
    } catch {
      onMessage("Não consegui iniciar o microfone agora. Tente de novo.");
    }
  }, [onEnd, onMessage, onStart, onTranscript]);

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
      <Button type="button" variant="outline" disabled className="h-11 w-11 p-0" title={VOICE_UNSUPPORTED_MESSAGE} aria-label="Ditar mensagem (indisponível neste navegador)">
        <Mic className="h-4 w-4 opacity-50" aria-hidden="true" />
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
      className={cn("h-11 w-11 p-0", listening && "motion-safe:animate-pulse")}
    >
      {listening ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );
}
