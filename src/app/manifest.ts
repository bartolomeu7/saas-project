import type { MetadataRoute } from "next";

/**
 * Manifesto do aplicativo instalável (PWA): o Prime Ges pode ser colocado na tela inicial do celular e abre em tela cheia,
 * sem a barra do navegador. É só o "cartão de visita" do app: quem acessa continua passando pelo login e pelas mesmas
 * proteções de sempre (o app abre em /app, que redireciona para o login quando não há sessão).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Prime Ges",
    short_name: "Prime Ges",
    description: "Gestão para pequenos negócios: agenda, vendas, clientes, caixa e financeiro.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111820",
    theme_color: "#111820",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Agenda", short_name: "Agenda", url: "/app/agenda", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Nova venda", short_name: "Venda", url: "/app/vendas/nova", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Clientes", short_name: "Clientes", url: "/app/clientes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Caixa", short_name: "Caixa", url: "/app/caixa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
