import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Bloco padrão das telas de Configurações: título, ajuda e conteúdo, no mesmo cartão em todas as telas. */
export function SettingsSection({
  id,
  title,
  description,
  badge,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  /** Selo ao lado do título (ex.: "Ativa"). */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card role="region" className={cn("overflow-hidden", className)} aria-labelledby={`${id}-titulo`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id={`${id}-titulo`} className="text-base">
            {title}
          </CardTitle>
          {badge}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
