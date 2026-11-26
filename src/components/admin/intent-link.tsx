"use client";

import Link from "next/link";
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * Link do painel que carrega a página INTEIRA quando a pessoa mostra intenção (passa o mouse, foca ou toca), para o
 * clique abrir na hora. Antes disso vale o padrão do Next (só o esqueleto). A validade do que foi carregado é curta
 * (`staleTimes.static` em next.config.js) e qualquer ação do painel (revalidatePath) descarta o que estava guardado.
 */
export const IntentLink = forwardRef<HTMLAnchorElement, Omit<ComponentPropsWithoutRef<typeof Link>, "prefetch">>(
  function IntentLink({ onMouseEnter, onFocus, onTouchStart, ...props }, ref) {
    const [intent, setIntent] = useState(false);

    return (
      <Link
        {...props}
        ref={ref}
        prefetch={intent ? true : null}
        onMouseEnter={(event) => {
          setIntent(true);
          onMouseEnter?.(event);
        }}
        onFocus={(event) => {
          setIntent(true);
          onFocus?.(event);
        }}
        onTouchStart={(event) => {
          setIntent(true);
          onTouchStart?.(event);
        }}
      />
    );
  },
);
