"use client";

import { useCallback, type FormEvent } from "react";

/**
 * Mantém o que a pessoa digitou quando o servidor responde com erro.
 *
 * Por padrão o React limpa os campos de um `<form action={...}>` assim que a ação termina, mesmo
 * quando deu erro (SKU repetido, conflito de horário…) — e a pessoa perdia tudo e tinha de digitar
 * de novo. Esse "limpar" é o evento `reset` do formulário, que pode ser cancelado.
 *
 * Uso: `const keepInput = useKeepInputOnError(state);` e `<form action={formAction} onReset={keepInput}>`.
 * Com erro, os campos ficam como estavam e a mensagem aparece; com sucesso, o formulário é limpo
 * normalmente (ou segue o redirecionamento da própria ação).
 *
 * O React limpa o formulário só depois de renderizar com o resultado da ação, então o `state` que
 * este handler enxerga já é o do envio que acabou de terminar.
 */
export function useKeepInputOnError(state: { error?: string | undefined } | undefined) {
  const hasError = Boolean(state?.error);
  return useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (hasError) event.preventDefault();
    },
    [hasError]
  );
}
