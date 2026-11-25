"use client";

import { useEffect, useState } from "react";
import { Banknote, Gift, Pause, Play, Warehouse } from "lucide-react";
import { SALE_ITEMS, SaleScreen } from "@/components/marketing/screens";
import { cn } from "@/lib/utils";

const EFFECTS = [
  { icon: Warehouse, label: "Estoque atualizado" },
  { icon: Banknote, label: "Entrou no caixa" },
  { icon: Gift, label: "Pontos creditados" },
];

// Passos 1..3 montam a venda; 4..6 acendem os efeitos; os passos extras seguram o resultado antes de recomeçar.
const LAST_STEP = SALE_ITEMS.length + EFFECTS.length;
const CYCLE = LAST_STEP + 3;

/**
 * Venda sendo registrada, em laço, no topo da home. O HTML do servidor já traz o estado final (visível sem
 * JavaScript); o laço só roda para quem não pediu menos movimento e pode ser pausado.
 */
export function HeroLive() {
  const [step, setStep] = useState(LAST_STEP);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Mostra o resultado por um instante antes de começar o laço.
    const start = window.setTimeout(() => {
      setStep(1);
      setPlaying(true);
    }, 1600);
    return () => window.clearTimeout(start);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStep((value) => (value >= CYCLE ? 1 : value + 1)), 900);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div className="flex flex-col gap-3">
      <SaleScreen items={Math.min(step, SALE_ITEMS.length)} done={step >= SALE_ITEMS.length} />
      <ul className="grid gap-2 sm:grid-cols-3">
        {EFFECTS.map((effect, index) => {
          const on = step >= SALE_ITEMS.length + index + 1;
          return (
            <li key={effect.label} className={cn("site-effect", on && "site-effect--on")}>
              <effect.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{effect.label}</span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setPlaying((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 self-end rounded-md px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        {playing ? "Pausar demonstração" : "Rodar demonstração"}
      </button>
    </div>
  );
}
