"use client";

import Link from "next/link";
import { AlertTriangle, Check, CircleAlert, Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage, PendingField } from "@/lib/chat/agenda-turn.ts";

/**
 * Chat AI — cartões de mensagem (docs/chat-ai/03 §3). Cada tipo de mensagem tem um componente; nada aqui grava dados:
 * as ações só chamam `onSend`, que manda texto ou uma escolha para a rota do chat.
 */

export interface UiMessage {
  id: string;
  role: "user" | "agent";
  /** mensagem estruturada da agente; ausente nas mensagens do usuário */
  message?: ChatMessage;
  text: string;
  /** o cartão já foi respondido: botões ficam travados (histórico) */
  resolved?: boolean;
  /** rascunho a que o cartão de confirmação se refere (id e versão exibida) */
  draft?: { id: string; version: number };
}

export type SendFn = (text: string, choice?: { field: PendingField; id: string }) => void;
export type ConfirmFn = (draft: { id: string; version: number }) => void;

export function AgentAvatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20"
      role="img"
      aria-label={name}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-base text-primary-foreground">{text}</p>
    </div>
  );
}

function Bubble({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "danger" | "info" | "success" }) {
  const icon = tone === "success" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : tone === "danger" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : tone === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : tone === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null;
  return (
    <div
      className={cn(
        "flex max-w-[94%] gap-2 whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border px-4 py-2.5 text-base",
        tone === "neutral" && "border-border bg-card text-foreground",
        tone === "info" && "border-primary/25 bg-primary/10 text-foreground",
        tone === "success" && "border-success/30 bg-success/10 text-foreground",
        tone === "warning" && "border-warning/30 bg-warning/10 text-foreground",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-foreground"
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

function OptionChips({ options, disabled, onPick }: { options: { id: string; label: string; detail?: string }[]; disabled?: boolean; onPick: (o: { id: string; label: string }) => void }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Opções">
      {options.map((o, i) => (
        <li key={o.id}>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onPick(o)} className="h-auto min-h-11 flex-col items-start gap-0 py-2 text-left text-base">
            <span>
              <span className="mr-1 text-muted-foreground">{i + 1}.</span>
              {o.label}
            </span>
            {o.detail ? <span className="text-xs font-normal text-muted-foreground">{o.detail}</span> : null}
          </Button>
        </li>
      ))}
    </ul>
  );
}

const FIELD_LINKS: Record<string, (id: string) => string> = {
  cliente: (id) => `/app/clientes/${id}`,
  servico: (id) => `/app/servicos/${id}`,
};

export function AgentMessage({ item, onSend, onConfirm, agentName, shadow, confirming }: { item: UiMessage; onSend: SendFn; onConfirm: ConfirmFn; agentName: string; shadow: boolean; confirming: boolean }) {
  const m = item.message;
  if (!m) return null;
  const locked = item.resolved === true;

  return (
    <div className="flex items-start gap-2">
      <AgentAvatar name={agentName} />
      <div className="min-w-0 flex-1">
        {m.kind === "notice" && <Bubble tone="info">{m.text}</Bubble>}
        {m.kind === "error" && <Bubble tone="danger">{m.text}</Bubble>}
        {m.kind === "result" && (
          <Bubble tone="success">
            {m.text}
            {m.link ? (
              <>
                {" "}
                <Link href={m.link.href} className="font-medium underline underline-offset-4">
                  {m.link.label}
                </Link>
              </>
            ) : null}
          </Bubble>
        )}

        {m.kind === "ask" && (
          <>
            <Bubble>{m.text}</Bubble>
            {m.options && m.options.length > 0 && <OptionChips options={m.options} disabled={locked} onPick={(o) => onSend(o.label)} />}
          </>
        )}

        {m.kind === "disambiguate" && (
          <>
            <Bubble>{m.text}</Bubble>
            <OptionChips options={m.options} disabled={locked} onPick={(o) => onSend(o.label, { field: m.field, id: o.id })} />
          </>
        )}

        {m.kind === "confirm" && (
          <section aria-label={`Confirmação: ${m.card.module}, ${m.card.title}`} className="max-w-xl rounded-xl border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">
                {m.card.module} <span aria-hidden="true">›</span> {m.card.title}
              </h3>
              <Badge variant="info">Criar</Badge>
            </header>
            <dl className="grid gap-x-4 gap-y-2 px-4 py-3 text-base sm:grid-cols-[8rem_1fr]">
              {m.card.fields.map((f) => {
                const href = f.link ? FIELD_LINKS[f.link.kind]?.(f.link.id) : undefined;
                return (
                  <div key={f.label} className="contents">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="break-words">
                      {href ? (
                        <Link href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline">
                          {f.value}
                          <span className="sr-only"> (abre em nova aba)</span>
                        </Link>
                      ) : (
                        <span className="font-medium">{f.value}</span>
                      )}
                      {f.note ? <span className="ml-2 text-xs text-muted-foreground">({f.note})</span> : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {m.card.warnings.length > 0 && (
              <ul className="space-y-1 border-t border-border px-4 py-2 text-xs text-warning">
                {m.card.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              {/* Confirmar só funciona fora do MODO TESTE (interruptor do servidor), uma vez por cartão e nunca em cartão antigo. */}
              <Button
                type="button"
                disabled={shadow || locked || confirming || !item.draft}
                aria-describedby={`shadow-${item.id}`}
                onClick={() => item.draft && onConfirm(item.draft)}
              >
                <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                {confirming ? "Gravando…" : "Confirmar"}
              </Button>
              <Button type="button" variant="outline" disabled={locked || confirming} onClick={() => onSend("Quero corrigir: ")}>
                Corrigir
              </Button>
              <Button type="button" variant="ghost" disabled={locked || confirming} onClick={() => onSend("cancela")}>
                Cancelar
              </Button>
              <p id={`shadow-${item.id}`} className="basis-full text-xs text-muted-foreground">
                {m.text}
              </p>
            </footer>
          </section>
        )}
      </div>
    </div>
  );
}
