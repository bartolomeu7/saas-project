"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Download, Pencil, RotateCcw, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";
import { deleteQuoteAction, duplicateQuoteAction, setQuoteStatusAction } from "@/lib/quotes/actions";
import type { QuoteStatus } from "@/lib/quotes/rules";

type Target = "sent" | "approved" | "rejected" | "draft";

/** Botões da página do orçamento. Quais aparecem vem das regras (`allowedTransitions`); o banco confere de novo. */
export function QuoteActions({ id, status, transitions }: { id: string; status: QuoteStatus; transitions: Target[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");

  function change(to: Target, note?: string) {
    start(async () => {
      const result = await setQuoteStatusAction(id, to, note);
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Situação atualizada.");
      router.refresh();
    });
  }

  function duplicate() {
    start(async () => {
      // em caso de sucesso a ação redireciona para a edição da cópia; só volta aqui se der erro
      const result = await duplicateQuoteAction(id);
      if (result?.error) toast.error(result.error);
    });
  }

  function remove() {
    start(async () => {
      const result = await deleteQuoteAction(id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Link href={`/app/orcamentos/${id}/editar`} className={cn(buttonVariants({ variant: "outline" }))}>
          <Pencil aria-hidden="true" /> Editar
        </Link>
      )}
      <a href={`/api/orcamentos/${id}/pdf`} className={cn(buttonVariants({ variant: status === "draft" ? "outline" : "default" }))}>
        <Download aria-hidden="true" /> Baixar PDF
      </a>
      {transitions.includes("sent") && (
        <Button type="button" disabled={pending} onClick={() => change("sent")}>
          <Send aria-hidden="true" /> Marcar como enviado
        </Button>
      )}
      {transitions.includes("approved") && (
        <Button type="button" disabled={pending} onClick={() => change("approved")}>
          <CheckCircle2 aria-hidden="true" /> Cliente aprovou
        </Button>
      )}
      {transitions.includes("rejected") && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" disabled={pending}>
              <XCircle aria-hidden="true" /> Cliente recusou
            </Button>
          }
          title="Marcar como recusado?"
          description={
            <span className="mt-2 flex flex-col gap-2 text-left">
              <Label htmlFor="quote-reject-reason">Motivo (opcional)</Label>
              <Input id="quote-reject-reason" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: achou caro, fechou com outra empresa" />
            </span>
          }
          confirmLabel="Marcar como recusado"
          onConfirm={() => {
            change("rejected", reason);
            setReason("");
          }}
        />
      )}
      {transitions.includes("draft") && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" disabled={pending}>
              <RotateCcw aria-hidden="true" /> Voltar para rascunho
            </Button>
          }
          title="Voltar para rascunho?"
          description="O orçamento volta a poder ser editado. Se já foi enviado ao cliente, o PDF antigo continua com ele: envie o novo depois de ajustar."
          confirmLabel="Voltar para rascunho"
          onConfirm={() => change("draft")}
        />
      )}
      <Button type="button" variant="ghost" disabled={pending} onClick={duplicate}>
        <Copy aria-hidden="true" /> Duplicar
      </Button>
      {status === "draft" && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" disabled={pending}>
              <Trash2 aria-hidden="true" /> Excluir
            </Button>
          }
          title="Excluir este rascunho?"
          description="O rascunho e seus itens serão apagados. O número dele não é reaproveitado."
          confirmLabel="Excluir"
          destructive
          onConfirm={remove}
        />
      )}
    </div>
  );
}
