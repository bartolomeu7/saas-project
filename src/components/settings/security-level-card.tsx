"use client";

import { useUser } from "@clerk/nextjs";
import { Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { computeSecurityLevel } from "@/lib/settings/security-level";

const LEVEL_BADGE = { basic: "warning", good: "info", strong: "success" } as const;

/** Resumo do nível de segurança da conta e do que ainda dá para melhorar. Só leitura: fatos da conta no Clerk + estado da segunda etapa (servidor). */
export function SecurityLevelCard({ twoFactorEnabled, backupCodesRemaining }: { twoFactorEnabled: boolean; backupCodesRemaining: number }) {
  const { isLoaded, user } = useUser();

  if (!isLoaded || !user) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-busy="true" aria-label="Carregando nível de segurança" />;
  }

  const level = computeSecurityLevel({
    hasPassword: user.passwordEnabled,
    hasVerifiedEmail: user.emailAddresses.some((item) => item.verification?.status === "verified"),
    hasVerifiedPhone: user.phoneNumbers.some((item) => item.verification?.status === "verified"),
    // a segunda etapa é do Prime Ges (não do Clerk): o estado vem do nosso servidor
    twoFactorEnabled,
    hasBackupCodes: backupCodesRemaining > 0,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={LEVEL_BADGE[level.name]}>Nível {level.label}</Badge>
        <span className="text-sm text-muted-foreground">{level.score} de 100 pontos</span>
      </div>
      <Progress value={level.score} aria-label={`Nível de segurança: ${level.label}, ${level.score} de 100`} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {level.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            {check.done ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Feito" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pendente" />
            )}
            <span className="min-w-0">
              <span className={check.done ? "text-foreground" : "font-medium text-foreground"}>{check.label}</span>
              {!check.done && <span className="block text-xs text-muted-foreground">{check.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
