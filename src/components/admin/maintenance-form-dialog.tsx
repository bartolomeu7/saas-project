"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MAINTENANCE_LEVEL_IMPACT, MAINTENANCE_LEVEL_LABELS, type MaintenanceLevel } from "@/lib/maintenance-gate";
import type { ActionResult } from "@/lib/auth/actions";

export interface MaintenanceFormValues {
  title: string;
  message: string;
  level: MaintenanceLevel;
  startsAt: string;
  expectedEndAt: string;
  announceHours: number;
  contact: string;
  note: string;
}

const DEFAULT_MESSAGE = "Vamos fazer uma atualização para deixar o Prime Ges ainda melhor. Seus dados estão seguros. Obrigado pela compreensão!";

/**
 * Agendar ou editar uma manutenção programada. Os horários são em horário de Brasília. Os campos são só conforto:
 * a Server Action e a função do banco conferem tudo de novo (período, conflito com outra manutenção, limites).
 */
export function MaintenanceFormDialog({
  triggerLabel,
  title,
  submitLabel,
  action,
  initial,
  triggerVariant = "default",
}: {
  triggerLabel: string;
  title: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<ActionResult>;
  initial: MaintenanceFormValues;
  triggerVariant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<MaintenanceLevel>(initial.level);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(result.success ?? "Salvo.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Não foi possível concluir a operação. Tente novamente.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Horários em horário de Brasília. O cliente vê o aviso a partir de “Aviso antecipado” antes do início.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="mw-title">Título *</Label>
            <Input id="mw-title" name="title" required maxLength={120} defaultValue={initial.title} placeholder="Ex.: Atualização do sistema" autoComplete="off" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mw-level">O que acontece durante a manutenção *</Label>
            <NativeSelect id="mw-level" name="level" required value={level} onChange={(event) => setLevel(event.target.value as MaintenanceLevel)}>
              {(Object.keys(MAINTENANCE_LEVEL_LABELS) as MaintenanceLevel[]).map((value) => (
                <option key={value} value={value}>
                  {MAINTENANCE_LEVEL_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{MAINTENANCE_LEVEL_IMPACT[level]}</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mw-message">Mensagem para o cliente *</Label>
            <Textarea id="mw-message" name="message" required maxLength={1000} rows={4} defaultValue={initial.message || DEFAULT_MESSAGE} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mw-start">Início *</Label>
              <Input id="mw-start" name="startsAt" type="datetime-local" required defaultValue={initial.startsAt} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mw-end">Previsão de término *</Label>
              <Input id="mw-end" name="expectedEndAt" type="datetime-local" required defaultValue={initial.expectedEndAt} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mw-announce">Aviso antecipado (horas)</Label>
              <Input id="mw-announce" name="announceHours" type="number" min={1} max={336} step={1} defaultValue={initial.announceHours} />
              <p className="text-xs text-muted-foreground">Quanto tempo antes a faixa aparece no app (1 a 336).</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mw-contact">Contato de suporte (opcional)</Label>
              <Input id="mw-contact" name="contact" maxLength={200} defaultValue={initial.contact} placeholder="Ex.: WhatsApp (11) 99999-0000" autoComplete="off" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mw-note">Nota interna (o cliente não vê)</Label>
            <Textarea id="mw-note" name="note" maxLength={1000} rows={2} defaultValue={initial.note} placeholder="Ex.: migration 20261121, voltar a imagem prev-pr123 se falhar" />
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Aguarde..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
