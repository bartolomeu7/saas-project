import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";

/**
 * Contexto do Clerk (auth()/currentUser()/useClerk()) para toda a árvore.
 * `localization` (pacote oficial @clerk/localizations) traduz os textos dos
 * componentes hospedados (<SignIn/>, <SignUp/>, menu de usuário) para pt-BR.
 */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider localization={ptBR}>{children}</ClerkProvider>;
}
