import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Bloqueia áreas autenticadas/funcionais (nunca fazem sentido no índice de
 * busca) e libera a landing page. Login/cadastro/recuperação de senha ficam
 * de fora por serem páginas funcionais, não conteúdo — evita que apareçam
 * como resultado de busca no lugar da landing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/app/*", "/admin", "/admin/*", "/onboarding", "/api/*", "/auth/*", "/login", "/register", "/forgot-password", "/reset-password"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
