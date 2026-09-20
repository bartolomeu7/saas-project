import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Só a landing page é conteúdo indexável — as demais rotas públicas
 * (login/cadastro/recuperação de senha) são funcionais, não páginas de
 * conteúdo, e ficam de fora tanto daqui quanto do robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
