import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Erro de um campo específico a partir do resultado de uma Server Action.
 * A action informa o `field` (atributo `name` do input) junto do `error`;
 * devolve `undefined` para qualquer outro campo.
 */
export function fieldError(state: ActionResult, name: string): string | undefined {
  return state.field === name ? state.error : undefined;
}

interface FormFieldProps {
  /** Texto do <label>. */
  label: React.ReactNode;
  /** Esconde o label visualmente (continua lido por leitores de tela). */
  hideLabel?: boolean;
  /** Ajuda exibida abaixo do campo; fica ligada ao controle por aria-describedby. */
  hint?: React.ReactNode;
  /** Mensagem de erro do campo. Quando presente, o controle recebe aria-invalid. */
  error?: string;
  className?: string;
  /** Um único controle (Input, NativeSelect, textarea...). */
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
}

/**
 * Campo de formulário: <label for> + controle + ajuda + erro, com a associação
 * semântica feita num lugar só. Sem erro, o controle NÃO é marcado como
 * inválido; com erro recebe `aria-invalid="true"` e `aria-describedby`
 * apontando para a mensagem (e para a ajuda, quando houver). Um `id` já
 * definido no controle é preservado.
 */
export function FormField({
  label,
  hideLabel = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  const autoId = React.useId();
  const id = children.props.id ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      {React.cloneElement(children, {
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
