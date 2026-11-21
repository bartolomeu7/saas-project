"use client";

import { useFormState } from "react-dom";
import { updateQuoteDefaultsAction } from "@/lib/companies/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { QuoteDefaults } from "@/lib/companies/queries";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormField, fieldError } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};

/** Padrões dos orçamentos: valem para todo orçamento novo da empresa e podem ser trocados em cada orçamento. */
export function QuoteDefaultsForm({ values }: { values: QuoteDefaults }) {
  const [state, formAction] = useFormState(updateQuoteDefaultsAction, initialState);
  const keepInput = useKeepInputOnError(state);

  return (
    <form action={formAction} onReset={keepInput} className="grid gap-4">
      <FormField label="Validade padrão (dias)" error={fieldError(state, "validityDays")} hint="Por quantos dias o preço do orçamento vale, contando da data de emissão (1 a 365)." className="max-w-xs">
        <Input name="validityDays" type="number" min={1} max={365} step={1} defaultValue={values.validityDays} required inputMode="numeric" />
      </FormField>
      <FormField label="Condições de pagamento" error={fieldError(state, "paymentTerms")} hint="Aparece no PDF. Ex.: Entrada de 50% e o saldo na entrega. Pix, cartão em até 3x.">
        <Textarea name="paymentTerms" defaultValue={values.paymentTerms} maxLength={1000} rows={3} />
      </FormField>
      <FormField label="Rodapé do orçamento" error={fieldError(state, "footer")} hint="Uma frase no fim do PDF. Ex.: Obrigado pela preferência!">
        <Input name="footer" defaultValue={values.footer} maxLength={300} autoComplete="off" />
      </FormField>
      <FormMessage state={state} />
      <div>
        <SubmitButton state={state} pendingLabel="Salvando..." className="w-auto">
          Salvar padrões
        </SubmitButton>
      </div>
    </form>
  );
}
