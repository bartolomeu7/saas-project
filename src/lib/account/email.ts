import "server-only";

import { buildAccountDeletedEmail } from "@/lib/account/email-content";

/**
 * Envio do e-mail de confirmação da exclusão, pela API HTTP do Resend (sem dependência nova).
 * Só envia se RESEND_API_KEY e EMAIL_FROM estiverem configurados; sem eles devolve false e a tela não promete e-mail.
 * Falha de envio NUNCA desfaz a exclusão (já aconteceu): só devolve false.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendAccountDeletedEmail(input: {
  to: string | null;
  fullName: string | null;
  companiesDeleted: number;
  companiesLeft: number;
}): Promise<boolean> {
  if (!input.to || !isEmailConfigured()) return false;

  const content = buildAccountDeletedEmail(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject: content.subject, text: content.text, html: content.html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("[account-deletion] envio do e-mail recusado:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[account-deletion] não foi possível enviar o e-mail:", error instanceof Error ? error.message : "erro desconhecido");
    return false;
  }
}
