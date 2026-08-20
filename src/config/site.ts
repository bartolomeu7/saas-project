/**
 * Configuração central e estática da aplicação.
 * Nenhum segredo deve ser colocado aqui — apenas metadados públicos.
 */
export const siteConfig = {
  name: "Micro SaaS",
  description: "Fundação de um produto SaaS moderno e escalável.",
  env: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;
