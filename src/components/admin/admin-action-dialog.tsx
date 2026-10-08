"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/auth/actions";

export type DialogField =
  | {
      type: "text" | "number" | "date" | "email";
      name: string;
      label: string;
      required?: boolean;
      placeholder?: string;
      defaultValue?: string | number;
      min?: number | string;
      max?: number | string;
      step?: number | string;
      maxLength?: number;
      hint?: string;
    }
  | {
      type: "textarea";
      name: string;
      label: string;
      required?: boolean;
      placeholder?: string;
      defaultValue?: string;
      maxLength?: number;
      hint?: string;
    }
  | {
      type: "select";
      name: string;
      label: string;
      required?: boolean;
      options: { value: string; label: string }[];
      defaultValue?: string;
      /** Rótulo da opção vazia (value ""), quando o campo é opcional. */
      emptyLabel?: string;
      hint?: string;
    }
  | {
      type: "checkbox";
      name: string;
      label: string;
      defaultChecked?: boolean;
      hint?: string;
    };

/**
 * Botão + modal (Dialog do shadcn/ui) com um formulário simples que chama uma
 * Server Action. Mostra o erro da operação dentro do próprio modal (role=alert),
 * avisa por toast e atualiza a página ao concluir. Os campos são só UX: a action e
 * a RPC SECURITY DEFINER revalidam tudo (formato, limites, permissão e hierarquia).
 */
export function AdminActionDialog({
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
  title,
  description,
  submitLabel,
  destructive = false,
  fields,
  action,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  fields: DialogField[];
  action: (formData: FormData) => Promise<ActionResult>;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        toast.success(result.success ?? "Operação concluída.");
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
        <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          {children}

          {fields.map((field) => {
            const id = `dlg-${field.name}`;

            if (field.type === "checkbox") {
              return (
                <div key={field.name} className="flex items-start gap-2">
                  <input
                    id={id}
                    name={field.name}
                    type="checkbox"
                    defaultChecked={field.defaultChecked}
                    className="mt-1 size-4 accent-[hsl(var(--primary))]"
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor={id}>{field.label}</Label>
                    {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                  </div>
                </div>
              );
            }

            return (
              <div key={field.name} className="grid gap-1.5">
                <Label htmlFor={id}>
                  {field.label}
                  {field.required && <span aria-hidden="true"> *</span>}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={id}
                    name={field.name}
                    required={field.required}
                    placeholder={field.placeholder}
                    defaultValue={field.defaultValue}
                    maxLength={field.maxLength}
                    rows={3}
                  />
                ) : field.type === "select" ? (
                  <NativeSelect id={id} name={field.name} required={field.required} defaultValue={field.defaultValue ?? ""}>
                    {(field.emptyLabel !== undefined || !field.required) && (
                      <option value="">{field.emptyLabel ?? "Selecione"}</option>
                    )}
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={id}
                    name={field.name}
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    defaultValue={field.defaultValue}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    maxLength={field.maxLength}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    autoComplete="off"
                  />
                )}
                {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              </div>
            );
          })}

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? "Aguarde..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
