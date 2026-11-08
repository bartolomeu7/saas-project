import type { AgendaVisualState } from "@/lib/agenda/week-view";

/**
 * Cores pedidas pelo dono: verde = concluído, branco = pendente (horário passou e não foi concluído),
 * azul = agendado por vir. Cancelado fica cinza apagado e "não compareceu" vermelho suave.
 */
export const STATE_STYLES: Record<AgendaVisualState, string> = {
  done: "border-emerald-500/60 bg-emerald-500/25 text-emerald-950 dark:text-emerald-50",
  pending: "border-zinc-300 bg-white text-zinc-900",
  upcoming: "border-sky-500/60 bg-sky-500/25 text-sky-950 dark:text-sky-50",
  cancelled: "border-border bg-muted/40 text-muted-foreground line-through opacity-70",
  no_show: "border-rose-500/50 bg-rose-500/15 text-rose-950 dark:text-rose-100",
};

/** Bolinha da cor do profissional (nome da cor em `professional_profiles.color`). Classes literais para o Tailwind enxergar. */
const PROFESSIONAL_DOTS: Record<string, string> = {
  sky: "bg-sky-400",
  blue: "bg-blue-500",
  emerald: "bg-emerald-400",
  green: "bg-green-500",
  rose: "bg-rose-400",
  red: "bg-red-500",
  amber: "bg-amber-400",
  yellow: "bg-yellow-400",
  orange: "bg-orange-400",
  violet: "bg-violet-400",
  purple: "bg-purple-400",
  indigo: "bg-indigo-400",
  pink: "bg-pink-400",
  teal: "bg-teal-400",
  cyan: "bg-cyan-400",
  lime: "bg-lime-400",
  fuchsia: "bg-fuchsia-400",
  slate: "bg-slate-400",
};

export function professionalDotClass(color: string | null | undefined): string {
  return (color ? PROFESSIONAL_DOTS[color.toLowerCase()] : undefined) ?? "bg-muted-foreground";
}
