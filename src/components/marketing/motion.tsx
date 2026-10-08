"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type RevealState = "idle" | "pending" | "visible";

/**
 * Entrada suave de uma seção ao rolar a página (único padrão de "reveal" da Home).
 *
 * Regras que evitam os problemas comuns desse efeito:
 *  - O HTML do servidor chega VISÍVEL (sem classe de ocultação): sem JavaScript, para buscadores e
 *    leitores de tela o conteúdo está sempre lá.
 *  - Só depois da hidratação, e só para o que está ABAIXO da dobra, o bloco vira "pending"
 *    (invisível e deslocado) e entra quando aparece na tela. Quem já está à vista não anima.
 *  - Só opacidade e transform mudam (sem layout shift).
 *  - Com prefers-reduced-motion o bloco nunca é escondido nem animado.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  distance = 18,
  duration = 600,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RevealState>("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setState("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setState("visible");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "prime-reveal",
        state === "pending" && "prime-reveal--pending",
        state === "visible" && "prime-reveal--visible",
        className,
      )}
      style={
        {
          "--reveal-delay": delay + "ms",
          "--reveal-distance": distance + "px",
          "--reveal-duration": duration + "ms",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** Barra fina de progresso de leitura no topo (estilo em home-v2.css; some com reduced motion). */
export function ScrollProgress() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const next = scrollable > 0 ? window.scrollY / scrollable : 0;
      setValue(Math.min(1, Math.max(0, next)));
      frame = 0;
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className="prime-scroll-progress"
      style={{ transform: "scaleX(" + value + ")" }}
      aria-hidden="true"
    />
  );
}
