"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Confirmação em modal (AlertDialog do shadcn/ui) no lugar de
 * window.confirm. `onConfirm` roda quando o usuário confirma; o modal
 * fecha em seguida.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Botão de texto que confirma em modal e, ao confirmar, envia o formulário
 * (Server Action). Mantém o mesmo fluxo dos botões antigos
 * (`<form action>` + window.confirm), agora com modal acessível.
 */
export function ConfirmActionForm({
  action,
  label,
  title,
  description,
  confirmLabel,
  destructive = false,
  triggerClassName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  triggerClassName?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        setPending(true);
        try {
          await action(formData);
        } finally {
          setPending(false);
        }
      }}
    >
      <ConfirmDialog
        title={title}
        description={description}
        confirmLabel={confirmLabel ?? label}
        destructive={destructive}
        onConfirm={() => formRef.current?.requestSubmit()}
        trigger={
          <button
            type="button"
            disabled={pending}
            className={cn(
              "text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              destructive ? "text-destructive" : "text-foreground",
              triggerClassName
            )}
          >
            {pending ? "Aguarde..." : label}
          </button>
        }
      />
    </form>
  );
}
