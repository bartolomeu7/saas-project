"use client";

import { useFormState } from "react-dom";
import { updateQuoteStyleAction } from "@/lib/companies/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { QuoteStyle } from "@/lib/quotes/style";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormField, fieldError } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};

const TEMPLATES = [
  { value: "modern", title: "Moderno", text: "Faixa colorida no topo, cartões e total em destaque." },
  { value: "classic", title: "Clássico", text: "Layout sóbrio, com linha e tabela na cor da marca." },
] as const;

/** Aparência do PDF do orçamento: modelo, cor da marca, texto de apresentação, Pix com QR Code e bloco de aceite. */
export function QuoteStyleForm({ values }: { values: QuoteStyle }) {
  const [state, formAction] = useFormState(updateQuoteStyleAction, initialState);
  const keepInput = useKeepInputOnError(state);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Modelo do PDF</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((template) => (
            <label key={template.value} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="template" value={template.value} defaultChecked={values.template === template.value} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{template.title}</span>
                <span className="block text-xs text-muted-foreground">{template.text}</span>
              </span>
            </label>
          ))}
        </div>
        {fieldError(state, "template") ? <p className="text-sm text-destructive">{fieldError(state, "template")}</p> : null}
      </fieldset>

      <FormField label="Cor da marca" error={fieldError(state, "brandColor")} hint="Usada na faixa, nos títulos, na tabela e no total do PDF. O texto sobre ela muda sozinho para continuar legível." className="max-w-xs">
        <Input name="brandColor" type="color" defaultValue={values.brandColor} className="h-10 w-24 cursor-pointer p-1" />
      </FormField>

      <FormField
        label="Texto de apresentação"
        error={fieldError(state, "introText")}
        hint="Aparece no começo do PDF. {cliente} vira o primeiro nome do cliente. Deixe em branco para não mostrar texto."
      >
        <Textarea name="introText" defaultValue={values.introText ?? ""} maxLength={600} rows={3} />
      </FormField>

      <div className="grid gap-4 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Pix com QR Code</p>
          <p className="text-xs text-muted-foreground">
            O PDF ganha um QR Code com o valor do orçamento já preenchido: o cliente escaneia no app do banco e o dinheiro cai na sua chave. O sistema não confirma o pagamento; confira no extrato do seu banco.
          </p>
        </div>
        <FormField label="Chave Pix" error={fieldError(state, "pixKey")} hint="CPF, CNPJ, celular com DDD, e-mail ou chave aleatória. Confira com cuidado: o valor vai para esta chave. Deixe em branco para não mostrar o Pix." className="max-w-md">
          <Input name="pixKey" defaultValue={values.pixKey ?? ""} maxLength={77} autoComplete="off" inputMode="text" />
        </FormField>
        <FormField label="Nome do recebedor (opcional)" error={fieldError(state, "pixName")} hint="Como aparece para o cliente ao pagar (até 25 letras). Em branco, usa o nome da empresa." className="max-w-md">
          <Input name="pixName" defaultValue={values.pixName ?? ""} maxLength={25} autoComplete="off" />
        </FormField>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="showAcceptance" defaultChecked={values.showAcceptance} className="mt-1 size-4 accent-[hsl(var(--primary))]" />
        <span>
          <span className="block font-medium">Mostrar o bloco de aceite com assinatura</span>
          <span className="block text-xs text-muted-foreground">Linhas para o cliente assinar e datar, confirmando que aceita a proposta.</span>
        </span>
      </label>

      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
          Salvar aparência
        </SubmitButton>
        <a href="/api/orcamentos/exemplo/pdf" target="_blank" rel="noopener" className="text-sm underline underline-offset-4">
          Ver PDF de exemplo (com o que está salvo)
        </a>
      </div>
    </form>
  );
}
