import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/clerk/config";

/**
 * Envolve a árvore com <ClerkProvider> somente quando a instância
 * Development do Clerk está configurada (ver src/lib/clerk/config.ts).
 * Sem chaves, devolve `children` sem alteração — o layout raiz continua
 * funcionando exatamente como antes, 100% Supabase Auth.
 *
 * ClerkProvider por si só não altera nada visualmente: nenhum componente
 * de UI do Clerk é renderizado ainda, só o contexto que auth()/
 * currentUser()/useAuth() precisam para funcionar quando chamados.
 */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
  if (!isClerkEnabled) {
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
