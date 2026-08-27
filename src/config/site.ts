/**
 * Configuração central e estática da aplicação.
 * Nenhum segredo deve ser colocado aqui — apenas metadados públicos.
 */
export const siteConfig = {
  name: "Prime Ges",
  description: "Prime Ges — plataforma SaaS moderna, modular e segura.",
  env: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  // Em desenvolvimento local, .env.local sempre define NEXT_PUBLIC_APP_URL
  // explicitamente (http://localhost:3000) — esse valor tem prioridade e
  // nunca chega a usar o fallback abaixo. O fallback só entra em cena
  // quando a variável não está definida em algum ambiente (ex: produção
  // configurada incorretamente na Vercel) — nesse caso, é mais seguro
  // cair para o domínio real do que para localhost (evita e-mails de
  // confirmação/recuperação de senha e redirects de OAuth apontando para
  // uma URL inacessível para o usuário final).
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://primeges.com.br",
  links: {
    login: "/login",
    register: "/register",
    forgotPassword: "/forgot-password",
    app: "/app",
  },
} as const;
