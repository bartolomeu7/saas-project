import { auth } from "@clerk/nextjs/server";
import { Laptop, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RevokeSessionButton } from "@/app/acesso-sessoes/revoke-session-button";
import { RevokeAllSessionsButton } from "@/components/settings/revoke-all-sessions-button";
import { listActiveClerkSessions } from "@/lib/auth/session-gate";
import { formatDateTime } from "@/lib/format";

/**
 * Aparelhos conectados à conta (sessões ativas no Clerk), lidos no servidor para ESTA pessoa. Mostra só dados NÃO
 * sensíveis (navegador, tipo de aparelho, cidade e último uso) — nunca IP, token ou cookie. Cada sessão pode ser
 * encerrada; a atual é marcada e não tem botão (para sair dela, use “Sair”).
 */
export async function ActiveDevices() {
  const { userId: clerkUserId, sessionId: currentSessionId } = await auth();
  if (!clerkUserId) return null;

  let sessions: Awaited<ReturnType<typeof listActiveClerkSessions>> = [];
  let failed = false;
  try {
    sessions = await listActiveClerkSessions(clerkUserId);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <p role="alert" className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
        Não foi possível carregar os aparelhos agora. Atualize a página em instantes.
      </p>
    );
  }

  const ordered = [...sessions].sort((a, b) => (a.id === currentSessionId ? -1 : b.id === currentSessionId ? 1 : b.lastActiveAt - a.lastActiveAt));
  const others = ordered.filter((s) => s.id !== currentSessionId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {ordered.length === 1 ? "1 aparelho conectado" : `${ordered.length} aparelhos conectados`} à sua conta agora.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {ordered.map((session) => {
          const activity = session.latestActivity;
          const mobile = Boolean(activity?.isMobile);
          const Icon = mobile ? Smartphone : Laptop;
          const device =
            [activity?.browserName, activity?.deviceType || (mobile ? "Celular" : undefined)].filter(Boolean).join(" · ") || "Aparelho";
          const place = [activity?.city, activity?.country].filter(Boolean).join(", ");
          const isCurrent = session.id === currentSessionId;
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-foreground">{device}</span>
                  {isCurrent && <Badge variant="info">Este aparelho</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {place ? `${place} · ` : ""}
                  {isCurrent ? "ativo agora" : `último uso ${formatDateTime(new Date(session.lastActiveAt).toISOString())}`}
                </span>
              </span>
              {!isCurrent && <RevokeSessionButton sessionId={session.id} />}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && <RevokeAllSessionsButton />}
    </div>
  );
}
