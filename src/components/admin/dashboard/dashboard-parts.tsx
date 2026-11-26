import type { CSSProperties, ReactNode } from "react";
import { CheckCircle2, ChevronRight, type LucideIcon } from "lucide-react";
import { IntentLink } from "@/components/admin/intent-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Ordem de entrada (cascata) de um bloco do painel. */
export const rise = (index: number) => ({ "--i": index }) as CSSProperties;

/** Linha de tendência em SVG a partir da série diária (decorativa: o número e o texto já dizem o valor). */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) return null;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - (value / max) * 24}`).join(" ");

  return (
    <svg className="prime-admin-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} pathLength={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Indicador clicável do topo do painel: leva direto à aba que detalha o número. */
export function StatCard({
  index,
  href,
  label,
  value,
  detail,
  icon: Icon,
  trend,
}: {
  index: number;
  href: string;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: LucideIcon;
  trend?: number[];
}) {
  return (
    <IntentLink href={href} className="prime-admin-rise prime-admin-stat group" style={rise(index)}>
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="prime-admin-stat__icon">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </span>
      <span className="mt-2 block truncate text-3xl font-semibold tracking-tight text-foreground tabular-nums">{value}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      {trend && <Sparkline values={trend} />}
    </IntentLink>
  );
}

export interface AttentionItem {
  label: string;
  href: string;
  count: number;
  tone: "danger" | "warning";
  icon: LucideIcon;
}

/** O que pede ação: primeiro o que tem pendência; o que está zerado fica recolhido numa linha "em dia". */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const open = items.filter((item) => item.count > 0).sort((a, b) => Number(b.tone === "danger") - Number(a.tone === "danger"));
  const clear = items.filter((item) => item.count === 0);

  return (
    <Card className="prime-admin-card">
      <CardHeader>
        <CardTitle className="text-base">Precisa de atenção</CardTitle>
        <CardDescription>{open.length === 0 ? "Nada pendente agora." : `${open.length} item(ns) pedem ação.`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {open.map((item, index) => {
          const Icon = item.icon;
          return (
            <IntentLink key={item.href} href={item.href} className={cn("prime-admin-rise prime-admin-attention", `prime-admin-attention--${item.tone}`)} style={rise(index)}>
              <span className="prime-admin-attention__icon">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="flex-1 text-foreground">{item.label}</span>
              <strong className="text-lg font-semibold tabular-nums text-foreground">{item.count}</strong>
              <ChevronRight className="prime-admin-attention__arrow size-4 text-muted-foreground" aria-hidden="true" />
            </IntentLink>
          );
        })}
        {clear.length > 0 && (
          <p className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
            <span>Em dia: {clear.map((item) => item.label.toLowerCase()).join(", ")}.</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
