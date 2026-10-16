import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { MonitorSmartphone, RefreshCw } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateSessionGate, listActiveClerkSessions, SESSION_LIMIT_MESSAGE, SESSION_UNVERIFIED_MESSAGE } from "@/lib/auth/session-gate";
import { SignOutButton } from "../acesso-indisponivel/sign-out-button";
import { RevokeSessionButton } from "./revoke-session-button";

export const metadata: Metadata = {
  title: "Limite de sessões",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Destino de quem tentou entrar com mais sessões simultâneas do que a conta permite (ou cuja sessão ainda não pôde ser
 * verificada). Reavalia o gate a cada visita: se uma vaga foi liberada (outra sessão encerrada ou expirada) ou o serviço
 * voltou, a pessoa é devolvida ao app sem precisar sair. Lista as outras sessões ativas com dados NÃO sensíveis
 * (navegador, aparelho, cidade) — nunca IP, token ou cookie.
 */
export default async function SessionLimitPage() {
  const { userId: clerkUserId, sessionId } = await auth();
  if (!clerkUserId || !sessionId) redirect("/login");

  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");

  const gate = await evaluateSessionGate(user.id);
  if (gate === "allowed") redirect("/app");

  // "unverified": não foi possível verificar agora (Clerk/serviço). Nada foi bloqueado; pede nova tentativa.
  if (gate === "unverified") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Logo iconSize={28} />
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <RefreshCw className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Verificando suas sessões</h1>
          <p className="max-w-md text-sm text-muted-foreground">{SESSION_UNVERIFIED_MESSAGE}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href="/app" className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
            Tentar novamente
          </a>
          <SignOutButton />
        </div>
      </main>
    );
  }

  let sessions: Awaited<ReturnType<typeof listActiveClerkSessions>> = [];
  try {
    sessions = await listActiveClerkSessions(clerkUserId);
  } catch {
    sessions = [];
  }
  const others = sessions.filter((s) => s.id !== sessionId);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Logo iconSize={28} />
      </div>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
        <MonitorSmartphone className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Limite de sessões atingido</h1>
        <p className="max-w-md text-sm text-muted-foreground">{SESSION_LIMIT_MESSAGE}</p>
      </div>

      {others.length > 0 && (
        <ul className="w-full divide-y divide-border rounded-lg border border-border bg-card text-left">
          {others.map((s) => {
            const a = s.latestActivity;
            const device = [a?.browserName, a?.deviceType || (a?.isMobile ? "Celular" : undefined)].filter(Boolean).join(" · ") || "Dispositivo";
            const place = [a?.city, a?.country].filter(Boolean).join(", ");
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium text-foreground">{device}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {place ? `${place} · ` : ""}último uso {new Date(s.lastActiveAt).toLocaleString("pt-BR")}
                  </span>
                </span>
                <RevokeSessionButton sessionId={s.id} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href="/app" className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
          Tentar novamente
        </a>
        <SignOutButton />
      </div>
    </main>
  );
}
