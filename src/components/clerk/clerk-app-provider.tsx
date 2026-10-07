import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

/** Contexto do Clerk (auth()/currentUser()/useClerk()) para toda a árvore. */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
