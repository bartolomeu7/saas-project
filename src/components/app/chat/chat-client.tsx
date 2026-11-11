"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentAvatar, AgentMessage, UserBubble, type ConfirmFn, type SendFn, type UiMessage } from "./chat-cards";
import { VoiceButton } from "./voice-button";
import type { ChatMessage } from "@/lib/chat/agenda-turn.ts";
import { mergeTranscript, VOICE_PRIVACY_NOTE } from "@/lib/chat/voice.ts";

/**
 * Chat AI — tela de conversa. Fala com POST /app/chat/turn e /app/chat/confirm; nunca grava nada por conta própria.
 * Acessibilidade: nova mensagem anunciada em região aria-live; Enter envia, Shift+Enter quebra linha; foco volta à caixa.
 * Sessão: antes de cada envio renova o token do Clerk (dura ~60 s) e, se o servidor ainda mandar para o login, tenta de novo
 * uma vez; se falhar, devolve o texto para a caixa (nada se perde).
 */

const MAX = 1000;
const EXAMPLES = ["Agendar uma lavagem para o João amanhã às 14h", "Marcar polimento para a Maria na sexta às 10h"];

const ERRORS: Record<number, string> = {
  400: "Não entendi essa mensagem. Tente escrever de outro jeito.",
  403: "O Chat AI não está ligado para a sua empresa.",
  404: "O Chat AI ainda não está disponível.",
  409: "Não foi possível confirmar agora. Confira o resumo e tente de novo.",
  422: "Não consegui gravar. Nada foi alterado.",
  429: "O limite de mensagens de hoje foi atingido. Tente amanhã.",
};
const SESSION_EXPIRED = "Sua sessão expirou. Recarregue a página para entrar de novo; o que você escreveu foi mantido na caixa.";
const GENERIC_ERROR = "Não consegui responder agora. Nada foi alterado. Tente de novo.";

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

/** A resposta indica problema de sessão (o servidor mandou para o login ou respondeu 401)? */
function isSessionProblem(res: Response): boolean {
  return res.status === 401 || res.redirected || !res.headers.get("content-type")?.includes("application/json");
}

export function ChatClient({ agentName, initialShadow = true, className }: { agentName: string; initialShadow?: boolean; className?: string }) {
  const { getToken } = useAuth();
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

  /** POST com renovação do token do Clerk e uma segunda tentativa se a sessão acabou de expirar. */
  const post = useCallback(
    async (url: string, body: unknown): Promise<Response> => {
      const run = () => fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      try {
        await getToken();
      } catch {
        // sem renovação: o servidor decide
      }
      let res = await run();
      if (isSessionProblem(res)) {
        try {
          await getToken({ skipCache: true });
        } catch {
          // segue para a segunda tentativa mesmo assim
        }
        res = await run();
      }
      return res;
    },
    [getToken]
  );

  const send: SendFn = useCallback(
    async (text, choice) => {
      const clean = text.trim();
      if ((!clean && !choice) || busy) return;
      stickToBottom.current = true;
      const bubbleId = nextId();
      // cartões anteriores ficam travados (histórico); só o mais novo é interativo
      setItems((prev) => [...prev.map((m) => (m.role === "agent" ? { ...m, resolved: true } : m)), { id: bubbleId, role: "user", text: clean || "(escolha)" }]);
      setInput("");
      setVoiceNote("");
      setBusy(true);
      const fail = (message: string) => {
        // devolve o texto à caixa e tira a bolha: a pessoa só toca em enviar de novo
        setItems((prev) => [...prev.filter((m) => m.id !== bubbleId), { id: nextId(), role: "agent", text: message, message: { kind: "error", text: message } }]);
        if (clean) setInput(clean);
        setAnnounce(message);
      };
      try {
        const res = await post("/app/chat/turn", { text: clean, sessionId: sessionId ?? undefined, choice, inputMode: voiceUsed ? "voz" : "texto" });
        if (isSessionProblem(res)) {
          // 401, ou redirecionado ao login, ou resposta que não é JSON
          fail(res.status >= 500 && !res.redirected ? GENERIC_ERROR : SESSION_EXPIRED);
          return;
        }
        if (!res.ok) {
          fail(ERRORS[res.status] ?? GENERIC_ERROR);
          return;
        }
        const data = (await res.json()) as TurnResponse;
        setVoiceUsed(false);
        if (data.sessionId) setSessionId(data.sessionId);
        setShadow(data.shadow !== false);
        const draft = data.draftId && data.version ? { id: data.draftId, version: data.version } : undefined;
        setItems((prev) => [...prev, ...data.messages.map((m) => ({ id: nextId(), role: "agent" as const, text: m.text, message: m, draft: m.kind === "confirm" ? draft : undefined }))]);
        setAnnounce(data.messages.map((m) => m.text).join(" "));
      } catch {
        fail("Sem conexão. Nada foi alterado. Tente de novo.");
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, post, sessionId, voiceUsed]
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
        const res = await post("/app/chat/confirm", { draftId: draft.id, version: draft.version });
        const isJson = res.headers.get("content-type")?.includes("application/json");
        const data = isJson && !res.redirected ? ((await res.json()) as ConfirmResponse) : null;
        if (data?.messages?.length) {
          // 200 (gravou ou já estava gravado) ou 409/422 com as mensagens do que mudou/falhou
          const ctx = data.draftId && data.version ? { id: data.draftId, version: data.version } : undefined;
          push(data.messages, ctx);
        } else {
          const message = data?.message ?? (isSessionProblem(res) ? "Sua sessão expirou. Recarregue a página e confira na Agenda antes de confirmar de novo." : (ERRORS[res.status] ?? "Não consegui gravar agora. Nada foi alterado. Tente de novo."));
          push([{ kind: "error", text: message }]);
        }
      } catch {
        push([{ kind: "error", text: "Sem conexão. Não sei se gravou: confira na Agenda antes de tentar de novo." }]);
      } finally {
        setConfirming(false);
        inputRef.current?.focus();
      }
    },
    [confirming, post]
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
    setVoiceUsed(false);
    setVoiceNote("");
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
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/40", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar name={agentName} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">{agentName}</p>
            <p className="truncate text-xs text-muted-foreground">{busy ? "conferindo…" : listening ? "ouvindo…" : shadow ? "modo teste: não grava" : "só gravo depois do seu Confirmar"}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy || items.length === 0} aria-label="Nova conversa" title="Nova conversa" className="h-10 w-10 shrink-0 p-0">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5" role="log" aria-label={`Conversa com ${agentName}`}>
        {items.length === 0 && (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-5 py-6 text-center">
            <p className="text-lg text-foreground">
              Oi! Eu sou a {agentName}.
              <br />
              <span className="text-muted-foreground">O que você quer agendar?</span>
            </p>
            <ul className="flex w-full flex-col gap-2" aria-label="Exemplos">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-12 w-full whitespace-normal py-2.5 text-left text-base font-normal"
                    onClick={() => {
                      setInput(ex);
                      inputRef.current?.focus();
                    }}
                  >
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-hidden="true">
            <AgentAvatar name={agentName} />
            <span className="motion-safe:animate-pulse">{agentName} está conferindo…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {voiceNote ? (
          <p className="mb-2 px-1 text-sm text-foreground" role="status">
            {voiceNote}
          </p>
        ) : null}
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
            placeholder={listening ? "Ouvindo… fale à vontade" : `Escreva ou dite para a ${agentName}…`}
            className="min-h-[3rem] max-h-40 flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <VoiceButton disabled={busy} onStart={onVoiceStart} onTranscript={onVoiceTranscript} onEnd={onVoiceEnd} onMessage={onVoiceMessage} privacyNote={VOICE_PRIVACY_NOTE} />
          <Button type="submit" disabled={busy || listening || input.trim().length === 0} aria-label="Enviar mensagem" className="h-12 w-12 shrink-0 p-0">
            <SendHorizontal className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        {input.length > MAX * 0.8 ? (
          <p className="mt-1 text-right text-xs text-muted-foreground" aria-hidden="true">
            {input.length}/{MAX}
          </p>
        ) : null}
      </form>
    </div>
  );
}
