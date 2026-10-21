/**
 * Configuração central e estática da aplicação.
 * Nenhum segredo deve ser colocado aqui — apenas metadados públicos.
 */
import { absoluteUrl, resolveSiteUrl } from "@/lib/seo/site-url";

// Domínio público (canonical, sitemap, Open Graph, callback do Pix). Validado por src/lib/seo/site-url.ts:
// ausente → domínio padrão + aviso; inválido → erro; em Production, http/localhost/*.vercel.app → erro no build.
const siteUrl = resolveSiteUrl({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  vercelEnv: process.env.VERCEL_ENV,
  appEnv: process.env.NEXT_PUBLIC_APP_ENV,
});
if (typeof window === "undefined" && siteUrl.warnings.length > 0) {
  const flag = globalThis as unknown as { __primeSiteUrlWarned?: boolean };
  if (!flag.__primeSiteUrlWarned) {
    flag.__primeSiteUrlWarned = true;
    for (const warning of siteUrl.warnings) console.warn(`[site-url] ${warning}`);
  }
}

export const siteConfig = {
  name: "Prime Ges",
  description:
    "Prime Ges: sistema online para pequenos negócios organizarem clientes, produtos, serviços, vendas, fidelidade, caixa, estoque e financeiro.",
  env: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  // Origem pública já validada (ver `siteUrl` acima). Em desenvolvimento, .env.local define
  // NEXT_PUBLIC_APP_URL (http://localhost:3000). Se a variável faltar, cai para o domínio de produção
  // (nunca para localhost) e o build registra um aviso.
  url: siteUrl.url,
  links: {
    login: "/login",
    register: "/register",
    app: "/app",
  },
} as const;

/**
 * Imagem de compartilhamento (Open Graph / Twitter): 1200 × 630, arquivo em `public/`. A URL é relativa de propósito:
 * o `metadataBase` do layout raiz (siteConfig.url) a torna absoluta. O nome leva as dimensões; ao trocar a imagem,
 * troque o nome do arquivo (assim os aplicativos de mensagem não ficam com a prévia antiga em cache).
 * Páginas que definem o próprio `openGraph` precisam repetir `images: [ogImage]` (o Next substitui o objeto inteiro).
 */
export const ogImage = {
  url: "/og-primeges-1200x630.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "Prime Ges: sistema de gestão para pequenos negócios. Seu negócio organizado, da venda ao caixa, com clientes, vendas, caixa, estoque e financeiro em um só lugar.",
} as const;

/**
 * Open Graph de uma página pública indexável: mesma origem de siteConfig.url, URL da própria página (og:url) e a
 * imagem de compartilhamento. Páginas que definem `openGraph` precisam usar isto (o Next substitui o objeto inteiro).
 * `title`/`description` são opcionais: se omitidos, o Next usa os da página.
 */
export function publicOpenGraph(path: string, extra: { title?: string; description?: string } = {}) {
  return {
    type: "website" as const,
    siteName: siteConfig.name,
    locale: "pt_BR",
    url: absoluteUrl(siteConfig.url, path),
    images: [ogImage],
    ...extra,
  };
}

/** Informações da validação do domínio (ambiente, origem do valor e avisos). */
export const siteUrlInfo = { kind: siteUrl.kind, source: siteUrl.source, warnings: siteUrl.warnings } as const;
