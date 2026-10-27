/**
 * Tema dos componentes hospedados do Clerk (<SignIn/>/<SignUp/>) alinhado ao
 * visual escuro do Prime Ges (tokens de globals.css, em hex porque o Clerk não
 * interpreta a sintaxe `hsl(h s% l%)` com espaços). Usa os nomes atuais das
 * variáveis (`colorForeground`, `colorInput`, ...): os antigos `colorText`,
 * `colorInputBackground` etc. são deprecados e deixavam o texto escuro sobre
 * o card escuro.
 *
 * O título/subtítulo do Clerk (`header`) fica oculto porque o AuthCard já
 * mostra o <h1> e a descrição da tela — evita dois <h1> e texto repetido.
 * O card do Clerk é "achatado" (sem borda/sombra/largura fixa) para viver
 * dentro do Card do AuthCard sem estourar o container no mobile.
 *
 * Correções visuais (auditoria de 27/10/2026, medidas na produção):
 * - `cl-cardBox` vem do Clerk com `overflow: hidden` e `cl-card` com `margin-left: -1px`: o rótulo "Seu e-mail"
 *   começava 1 px fora da caixa e perdia a primeira letra, e o anel de foco dos campos (4 px) era cortado nas laterais.
 *   Aqui o overflow fica visível e a margem zerada; o Card do AuthCard já reserva o respiro de 24 px.
 * - O anel de foco padrão do Clerk (4 px azul sólido) fica mais discreto: 1 px sólido + halo de 3 px a 25 %.
 *
 * Substituir a UI pronta do Clerk por formulário próprio segue como decisão
 * de UI separada, ainda em aberto.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#168BFF", // --primary
    colorPrimaryForeground: "#FFFFFF",
    colorBackground: "#17212C", // --card
    colorForeground: "#E8EEF5", // --foreground
    colorMutedForeground: "#8795A6", // --muted-foreground
    colorMuted: "#1B2633", // --secondary
    colorInput: "#1B2633",
    colorInputForeground: "#E8EEF5",
    colorBorder: "#253342", // --border
    colorNeutral: "#E8EEF5",
    colorDanger: "#F87171", // --destructive
    colorSuccess: "#22C55E", // --success
    colorWarning: "#F59E0B", // --warning
    colorRing: "#168BFF",
    borderRadius: "0.6rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: { width: "100%", maxWidth: "100%", border: 0, background: "transparent", boxShadow: "none", overflow: "visible" },
    card: { width: "100%", maxWidth: "100%", margin: 0, border: 0, background: "transparent", padding: 0, boxShadow: "none" },
    header: "hidden",
    formFieldInput: {
      "&:focus": { boxShadow: "0 0 0 1px #168BFF, 0 0 0 3px rgba(22, 139, 255, 0.25)" },
    },
    footer: { background: "transparent" },
    // O link do rodapé ("Registre-se"/"Entrar") fica no fundo --secondary a 13 px: o azul
    // primário dá exatamente 4,5:1 e reprova no axe. Azul claro (o mesmo do badge da Home) dá ~7:1.
    footerActionLink: { color: "#70BEFF" },
  },
} as const;
