"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceButton } from "./voice-button";
import { mergeTranscript, VOICE_PRIVACY_NOTE } from "@/lib/chat/voice.ts";
import { AgentAvatar, AgentMessage, UserBubble, type ConfirmFn, type SendFn, type UiMessage } from "./chat-cards";
import type { ChatMessage } from "@/lib/chat/agenda-turn.ts";

/**
 * Chat AI — tela de conversa (modo teste). Fala com POST /app/chat/turn; nunca grava nada por conta própria.
 * Acessibilidade: nova mensagem anunciada em região aria-live; Enter envia, Shift+Enter quebra linha; foco volta à caixa.
 */

const MAX = 1000;
const EXAMPLES = [
  "Agendar uma lavagem detalhada para o João amanhã às 14h",
  "Marcar polimento para a Maria na sexta às 10h",
  "Agendar serviço para um cliente",
];

const ERRORS: Record<number, string> = {
  400: "Não entendi essa mensagem. Tente escrever de outro jeito.",
  401: "Sua sessão expirou. Entre de novo para continuar.",
  403: "O Chat AI não está ligado para a sua empresa.",
  404: "O Chat AI ainda não está disponível.",
  429: "O limite de mensagens de hoje foi atingido. Tente amanhã.",
  409: "Não foi possível confirmar agora. Confira o resumo e tente de novo.",
  422: "Não consegui gravar. Nada foi alterado.",
};

interface TurnResponse {
  sessionId: string;
  draftId: string | null;
  version: number | null;
  status: string;
  shadow: boolean;
  messages: ChatMessage[];
}

interface ConfirmResponse {
  status?: string;
  messages?: ChatMessage[];
  message?: string;
  draftId?: string | null;
  version?: number | null;
}

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${counter++}`;

export function ChatClient({ agentName, initialShadow = true }: { agentName: string; initialShadow?: boolean }) {
  const [items, setItems] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shadow, setShadow] = useState(initialShadow);
  const [confirming, setConfirming] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const voiceBase = useRef("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [items, busy]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send: SendFn = useCallback(
    async (text, choice) => {
      const clean = text.trim();
      if ((!clean && !choice) || busy) return;
      stickToBottom.current = true;
      // cartões anteriores ficam travados (histórico); só o mais novo é interativo
      setItems((prev) => [...prev.map((m) => (m.role === "agent" ? { ...m, resolved: true } : m)), { id: nextId(), role: "user", text: clean || "(escolha)" }]);
      setInput("");
      setVoiceUsed(false);
      setVoiceNote("");
      setBusy(true);
      try {
        const res = await fetch("/app/chat/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: clean, sessionId: sessionId ?? undefined, choice, inputMode: voiceUsed ? "voz" : "texto" }),
        });
        const isJson = res.headers.get("content-type")?.includes("application/json");
        if (!res.ok || !isJson) {
          const message = !isJson ? ERRORS[401]! : (ERRORS[res.status] ?? "Não consegui responder agora. Nada foi alterado. Tente de novo.");
          setItems((prev) => [...prev, { id: nextId(), role: "agent", text: message, message: { kind: "error", text: message } }]);
          setAnnounce(message);
          return;
        }
        const data = (await res.json()) as TurnResponse;
        if (data.sessionId) setSessionId(data.sessionId);
        setShadow(data.shadow !== false);
        const draft = data.draftId && data.version ? { id: data.draftId, version: data.version } : undefined;
        setItems((prev) => [...prev, ...data.messages.map((m) => ({ id: nextId(), role: "agent" as const, text: m.text, message: m, draft: m.kind === "confirm" ? draft : undefined }))]);
        setAnnounce(data.messages.map((m) => m.text).join(" "));
      } catch {
        const message = "Sem conexão. Nada foi alterado. Tente de novo.";
        setItems((prev) => [...prev, { id: nextId(), role: "agent", text: message, message: { kind: "error", text: message } }]);
        setAnnounce(message);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, sessionId, voiceUsed]
  );

  // Confirmar: manda só (rascunho, versão); o servidor revalida tudo e grava uma vez (clique duplicado devolve o mesmo resultado)
  const confirm: ConfirmFn = useCallback(
    async (draft) => {
      if (confirming) return;
      setConfirming(true);
      const push = (messages: ChatMessage[], draftCtx?: { id: string; version: number }) => {
        setItems((prev) => [
          ...prev.map((m) => (m.role === "agent" ? { ...m, resolved: true } : m)),
          ...messages.map((m) => ({ id: nextId(), role: "agent" as const, text: m.text, message: m, draft: m.kind === "confirm" ? draftCtx : undefined })),
        ]);
        setAnnounce(messages.map((m) => m.text).join(" "));
      };
      try {
        const res = await fetch("/app/chat/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draftId: draft.id, version: draft.version }),
        });
        const isJson = res.headers.get("content-type")?.includes("application/json");
        const data = isJson ? ((await res.json()) as ConfirmResponse) : null;
        if (data?.messages?.length) {
          // 200 (gravou ou já estava gravado) ou 409/422 com as mensagens do que mudou/falhou
          const ctx = data.draftId && data.version ? { id: data.draftId, version: data.version } : undefined;
          push(data.messages, ctx);
        } else {
          const message = data?.message ?? (!isJson ? ERRORS[401]! : (ERRORS[res.status] ?? "Não consegui gravar agora. Nada foi alterado. Tente de novo."));
          push([{ kind: "error", text: message }]);
        }
      } catch {
        push([{ kind: "error", text: "Sem conexão. Não sei se gravou: confira na Agenda antes de tentar de novo." }]);
      } finally {
        setConfirming(false);
        inputRef.current?.focus();
      }
    },
    [confirming]
  );

  // Ditado: a fala vira texto na caixa (editável); nada é enviado sozinho
  const onVoiceStart = useCallback(() => {
    voiceBase.current = input;
    setVoiceUsed(true);
    setListening(true);
  }, [input]);
  const onVoiceTranscript = useCallback((text: string) => {
    setInput(mergeTranscript(voiceBase.current, text).slice(0, MAX));
  }, []);
  const onVoiceEnd = useCallback(() => {
    setListening(false);
    setAnnounce("Pronto. Confira o texto e envie quando estiver certo.");
    inputRef.current?.focus();
  }, []);
  const onVoiceMessage = useCallback((text: string) => {
    setVoiceNote(text);
    setAnnounce(text);
  }, []);

  const reset = () => {
    setItems([]);
    setSessionId(null);
    setInput("");
    setAnnounce("Nova conversa iniciada.");
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  };

  const lastUserIndex = items.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[26rem] flex-col rounded-xl border border-border bg-card/40">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <AgentAvatar name={agentName} />
          <div>
            <p className="text-sm font-semibold leading-tight">{agentName}</p>
            <p className="text-xs text-muted-foreground" aria-hidden={!busy}>
              {busy ? "conferindo…" : shadow ? "Modo teste — ainda não grava nada" : "Eu só gravo depois do seu Confirmar"}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy || items.length === 0}>
          <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
          Nova conversa
        </Button>
      </header>

      <div ref={listRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label={`Conversa com ${agentName}`}>
        {items.length === 0 && (
          <div className="mx-auto max-w-md space-y-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Oi! Eu sou a {agentName}. Por enquanto consigo <strong className="text-foreground">agendar serviços</strong>. Eu pergunto o que faltar e só mostro o resumo para você conferir.
            </p>
            <ul className="flex flex-wrap justify-center gap-2" aria-label="Exemplos">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <Button type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => { setInput(ex); inputRef.current?.focus(); }}>
                    {ex}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {items.map((m, index) =>
          m.role === "user" ? (
            <UserBubble key={m.id} text={m.text} />
          ) : (
            // só os cartões depois da última fala do usuário continuam interativos
            <AgentMessage key={m.id} item={{ ...m, resolved: m.resolved || index < lastUserIndex }} onSend={send} onConfirm={confirm} agentName={agentName} shadow={shadow} confirming={confirming} />
          )
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden="true">
            <AgentAvatar name={agentName} />
            <span className="motion-safe:animate-pulse">{agentName} está conferindo…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sr-only" role="status" aria-live="polite">{announce}</div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Mensagem para {agentName}
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value.slice(0, MAX));
              if (e.target.value.trim() === "") setVoiceUsed(false);
            }}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={MAX}
            placeholder={listening ? "Ouvindo… fale agora" : `Escreva ou dite para a ${agentName}…`}
            className="min-h-[2.75rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <VoiceButton disabled={busy} onStart={onVoiceStart} onTranscript={onVoiceTranscript} onEnd={onVoiceEnd} onMessage={onVoiceMessage} />
          <Button type="submit" disabled={busy || listening || input.trim().length === 0} aria-label="Enviar mensagem" className="h-11 w-11 p-0">
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {voiceNote ? (
          <p className="mt-1 text-xs text-foreground" role="status">
            {voiceNote}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">{VOICE_PRIVACY_NOTE}</p>
        <p className="text-right text-xs text-muted-foreground" aria-hidden="true">
          {input.length}/{MAX} · Enter envia, Shift+Enter quebra linha
        </p>
      </form>
    </div>
  );
}
