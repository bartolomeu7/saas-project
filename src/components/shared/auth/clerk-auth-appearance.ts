/**
 * Tema mínimo dos componentes hospedados do Clerk (<SignIn/>/<SignUp/>)
 * para não destoarem do visual escuro do Prime Ges enquanto usamos a UI
 * pronta do Clerk (Fase 5B-APP — cutover funcional; substituir por
 * formulário próprio com hooks do Clerk é uma decisão de UI separada,
 * ainda em aberto, ver missão original "SHADCN/UI + Clerk").
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "hsl(207 100% 54%)",
    colorBackground: "hsl(211 31% 13%)",
    colorInputBackground: "hsl(212 30% 16%)",
    colorInputText: "hsl(212 39% 94%)",
    colorText: "hsl(212 39% 94%)",
    colorTextSecondary: "hsl(213 15% 59%)",
    borderRadius: "0.6rem",
  },
  elements: {
    card: "shadow-none",
    rootBox: "w-full",
  },
} as const;
