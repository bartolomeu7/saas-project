"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentAvatar, AgentMessage, UserBubble, type SendFn, type UiMessage } from "./chat-cards";
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
};

interface TurnResponse {
  sessionId: string;
  status: string;
  messages: ChatMessage[];
}

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${counter++}`;

export function ChatClient({ agentName }: { agentName: string }) {
  const [items, setItems] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
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
      setBusy(true);
      try {
        const res = await fetch("/app/chat/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: clean, sessionId: sessionId ?? undefined, choice }),
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
        setItems((prev) => [...prev, ...data.messages.map((m) => ({ id: nextId(), role: "agent" as const, text: m.text, message: m }))]);
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
    [busy, sessionId]
  );

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
              {busy ? "conferindo…" : "Modo teste — ainda não grava nada"}
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
            <AgentMessage key={m.id} item={{ ...m, resolved: m.resolved || index < lastUserIndex }} onSend={send} agentName={agentName} />
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
            onChange={(e) => setInput(e.target.value.slice(0, MAX))}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={MAX}
            placeholder={`Escreva para a ${agentName}…`}
            className="min-h-[2.75rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={busy || input.trim().length === 0} aria-label="Enviar mensagem" className="h-11 w-11 p-0">
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground" aria-hidden="true">
          {input.length}/{MAX} · Enter envia, Shift+Enter quebra linha
        </p>
      </form>
    </div>
  );
}
