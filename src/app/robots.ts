import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Estratégia de rastreamento:
 *  - BLOQUEIA (Disallow) só o que é privado/técnico e nunca deve ser buscado: área autenticada, administração,
 *    onboarding, /conta e APIs. Isto NÃO é controle de segurança (a proteção é a autenticação); páginas privadas também
 *    têm `noindex` e redirecionam anônimos para o login.
 *  - NÃO bloqueia as telas públicas funcionais (/login, /register, /conta-excluida): elas ficam rastreáveis com
 *    `<meta name="robots" content="noindex, nofollow">`. Bloquear no robots.txt impediria o Google de LER o noindex e
 *    poderia deixar a URL no índice "sem conteúdo".
 *  - Declara o sitemap na origem validada (siteConfig.url).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // "/conta$" e "/conta/" (e não "/conta"): o prefixo simples também bloquearia "/conta-excluida".
      disallow: ["/app", "/app/*", "/admin", "/admin/*", "/onboarding", "/conta$", "/conta/", "/api/*", "/auth/*", "/forgot-password", "/reset-password"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
