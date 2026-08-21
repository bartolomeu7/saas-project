/**
 * Configuração central e estática da aplicação.
 * Nenhum segredo deve ser colocado aqui — apenas metadados públicos.
 */
export const siteConfig = {
  name: "Prime Ges",
  description: "Prime Ges — plataforma SaaS moderna, modular e segura.",
  env: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  links: {
    login: "/login",
    register: "/register",
    forgotPassword: "/forgot-password",
    app: "/app",
  },
} as const;
