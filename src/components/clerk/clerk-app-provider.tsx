import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";

/**
 * Contexto do Clerk (useClerk(), <SignIn/>, <SignUp/>, renovação do token da sessão no navegador).
 * `localization` (pacote oficial @clerk/localizations) traduz os textos dos
 * componentes hospedados (<SignIn/>, <SignUp/>, menu de usuário) para pt-BR.
 *
 * NÃO fica no layout raiz: o provider injeta o clerk-js e o pacote de interface do Clerk (centenas de KB) em toda página
 * que o renderiza. A home e as páginas legais são estáticas, não usam nada do Clerk no navegador e por isso ficam sem
 * ele. Cada rota que precisa dele (login, cadastro, onboarding, aceite de termos, sessões, conta, /app e /admin) o
 * recebe no seu próprio layout; tests/unit/performance-clerk-scope.test.mjs garante essa cobertura. A autenticação no
 * servidor (clerkMiddleware, auth(), currentUser()) não depende do provider e segue valendo em todas as rotas.
 */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider localization={ptBR}>{children}</ClerkProvider>;
}

/** Layout de segmento que só entrega o contexto do Clerk (usado nas rotas que ficam fora de /app e /admin). */
export function ClerkSegmentLayout({ children }: { children: ReactNode }) {
  return <ClerkAppProvider>{children}</ClerkAppProvider>;
}
