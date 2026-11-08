/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não anuncia o framework em cada resposta (X-Powered-By: Next.js).
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    // Headers de segurança padrão, sem CSP: a aplicação usa fontes/scripts
    // de terceiros pontuais (ex: Google Fonts) e uma CSP mal calibrada
    // quebraria isso silenciosamente — exige seu próprio teste dedicado,
    // fora do escopo de uma alteração aditiva sem validação ao vivo.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // O service worker nunca fica em cache do navegador/CDN: uma versão nova precisa valer na hora.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
