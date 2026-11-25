"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { openPaymentTicketAction } from "@/lib/billing/actions";
import { formatDateTime } from "@/lib/format";
import { TICKET_MESSAGE_MAX, TICKET_MESSAGE_MIN, TICKET_REASONS, TICKET_REASON_LABELS } from "@/types/billing";
import type { PaymentTicket } from "@/types/billing";

/**
 * Suporte da ordem de pagamento: o cliente abre um chamado ligado à ordem e vê a resposta da equipe nesta mesma tela.
 * Os limites daqui são só conveniência: quem decide é a função de banco open_payment_ticket.
 */
export function PaymentSupport({ paymentId, orderCode, tickets }: { paymentId: string; orderCode: string; tickets: PaymentTicket[] | null }) {
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState<string>(TICKET_REASONS[0]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasOpen = tickets?.some((ticket) => ticket.status === "open") ?? false;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await openPaymentTicketAction({ paymentId, reason, message });
      if (!result.ok) {
        setError(result.error ?? "Não foi possível abrir o chamado agora. Tente novamente.");
        return;
      }
      setMessage("");
      setFormOpen(false);
    });
  }

  return (
    <section aria-labelledby="payment-support-title" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-soft">
      <div>
        <h2 id="payment-support-title" className="text-base font-semibold text-foreground">
          Suporte desta ordem
        </h2>
        <p className="text-sm text-muted-foreground">Pagou e não liberou, ou teve algum problema? Fale com a equipe sobre a ordem {orderCode}.</p>
      </div>

      {tickets === null && <p className="text-sm text-destructive">Não foi possível carregar os chamados desta ordem. Atualize a página.</p>}

      {tickets && tickets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{TICKET_REASON_LABELS[ticket.reason] ?? ticket.reason}</p>
                <Badge variant={ticket.status === "open" ? "warning" : "success"}>{ticket.status === "open" ? "Aguardando resposta" : "Respondido"}</Badge>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{ticket.message}</p>
              <p className="text-xs text-muted-foreground">Enviado em {formatDateTime(ticket.created_at)}</p>
              {ticket.reply && (
                <div className="rounded-md bg-secondary px-3 py-2">
                  <p className="text-xs font-medium text-foreground">
                    Resposta do suporte{ticket.resolved_at ? ` em ${formatDateTime(ticket.resolved_at)}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">{ticket.reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p role="status" className="text-sm text-muted-foreground empty:sr-only">
        {hasOpen ? "Seu chamado foi enviado. A resposta aparece aqui, nesta ordem." : null}
      </p>

      {tickets && !hasOpen && !formOpen && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setFormOpen(true)}>
          Preciso de ajuda com esta ordem
        </Button>
      )}

      {tickets && !hasOpen && formOpen && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-reason">Assunto</Label>
            <NativeSelect id="ticket-reason" className="w-full" value={reason} onChange={(event) => setReason(event.target.value)}>
              {TICKET_REASONS.map((value) => (
                <option key={value} value={value}>
                  {TICKET_REASON_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-message">O que aconteceu?</Label>
            <Textarea
              id="ticket-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              minLength={TICKET_MESSAGE_MIN}
              maxLength={TICKET_MESSAGE_MAX}
              rows={4}
              aria-describedby="ticket-message-hint"
              placeholder="Ex.: paguei às 14h pelo app do meu banco e o plano não foi liberado."
            />
            <p id="ticket-message-hint" className="text-xs text-muted-foreground">
              De {TICKET_MESSAGE_MIN} a {TICKET_MESSAGE_MAX} caracteres. Não envie senhas nem dados de cartão.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" disabled={pending} className="sm:flex-1">
              {pending ? "Enviando..." : "Abrir chamado"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
