"use client";

import { useEffect, useRef, useState } from "react";
import { SALE_FLOW } from "@/config/marketing";
import { ProductScreen } from "@/components/marketing/screens";
import { cn } from "@/lib/utils";

/**
 * "Uma venda e o resto se atualiza": no computador os passos rolam à esquerda enquanto a tela à direita fica fixa e
 * troca conforme o passo no meio da janela; no celular cada passo traz a própria tela. Todo o texto está no HTML.
 */
export function SaleFlow() {
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      // Só a faixa do meio da janela conta: um passo ativo por vez.
      { rootMargin: "-48% 0px -48% 0px" },
    );
    steps.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)] lg:gap-20">
      <ol className="flex flex-col gap-12 lg:gap-0">
        {SALE_FLOW.map((step, index) => (
          <li
            key={step.screen}
            ref={(node) => {
              steps.current[index] = node;
            }}
            data-step={index}
            className="flex flex-col justify-center gap-5 lg:min-h-[52vh]"
          >
            <div className={cn("site-step", active === index && "site-step--active")}>
              <span className="site-step__number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-2 max-w-md text-base leading-7 text-muted-foreground">{step.text}</p>
              </div>
            </div>
            <div className="lg:hidden">
              <ProductScreen id={step.screen} />
            </div>
          </li>
        ))}
      </ol>

      <div className="hidden lg:block">
        <div className="sticky top-[calc(50vh-13rem)] h-[26rem]">
          {SALE_FLOW.map((step, index) => (
            <div key={step.screen} className={cn("site-swap", active === index && "site-swap--active")} aria-hidden={active !== index}>
              <ProductScreen id={step.screen} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
