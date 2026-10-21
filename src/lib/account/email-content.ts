/**
 * Texto do e-mail de confirmação da exclusão da conta (puro: sem I/O). Não inclui dados além do primeiro nome e
 * nunca promete o que o sistema não faz: o que foi apagado e o que a lei obriga a manter estão ditos aqui.
 */
export interface AccountDeletedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildAccountDeletedEmail(input: { fullName: string | null; companiesDeleted: number; companiesLeft: number }): AccountDeletedEmail {
  const firstName = input.fullName?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Olá, ${firstName}.` : "Olá.";

  const lines: string[] = [
    greeting,
    "Confirmamos que a sua conta no Prime Ges foi excluída a seu pedido.",
    "O que foi apagado: seu nome, e-mail, foto e login, as suas preferências e os seus acessos.",
  ];
  if (input.companiesDeleted > 0) {
    lines.push(
      input.companiesDeleted === 1
        ? "A empresa que só você usava e todos os dados dela (clientes, produtos, vendas, caixa, financeiro e arquivos) também foram apagados."
        : `As ${input.companiesDeleted} empresas que só você usava e todos os dados delas (clientes, produtos, vendas, caixa, financeiro e arquivos) também foram apagados.`
    );
  }
  if (input.companiesLeft > 0) {
    lines.push("Você saiu das empresas que continuam com outras pessoas; os dados delas permanecem com os responsáveis.");
  }
  lines.push(
    "O que a lei nos obriga a manter, sem identificar você: o registro do aceite dos Termos de Uso e da Política de Privacidade e, se houve pagamento, os dados da cobrança (valor, data e identificador, sem nome nem documento), por até 5 anos.",
    "Se você pagou um plano e quer desistir dentro de 7 dias da compra, o estorno é feito em 10 a 15 dias úteis depois do pedido pelo nosso canal de atendimento.",
    "Equipe Prime Ges"
  );

  const text = lines.join("\n\n");
  const html = lines.map((line) => `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(line)}</p>`).join("");
  return {
    subject: "Sua conta no Prime Ges foi excluída",
    text,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;max-width:560px">${html}</div>`,
  };
}
