/**
 * Agenda — aviso ao cliente pelo WhatsApp: abre a conversa (wa.me) com a mensagem pronta. Nada é enviado sozinho:
 * a pessoa confere e toca em enviar no próprio WhatsApp. "Agendado" pede confirmação; "Confirmado" vira lembrete.
 */

export interface WhatsappAppointment {
  status: string;
  starts_at: string;
  customer_id: string | null;
  customer_name?: string | null;
  /** só dígitos, com o 55; null quando o cliente não tem telefone brasileiro válido */
  customer_whatsapp?: string | null;
  service_name?: string | null;
  professional_name?: string | null;
}

export interface WhatsappNotice {
  label: string;
  /** null: o aviso caberia, mas falta um telefone válido no cadastro do cliente */
  href: string | null;
}

const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...options }).format(date);

/** null quando não há o que avisar: sem cliente, atendimento encerrado ou horário que já passou. */
export function whatsappNotice(appointment: WhatsappAppointment, companyName: string, now: Date): WhatsappNotice | null {
  const { status } = appointment;
  const start = new Date(appointment.starts_at);
  if (status !== "scheduled" && status !== "confirmed") return null;
  if (!appointment.customer_id || !(start.getTime() > now.getTime())) return null;

  const asking = status === "scheduled";
  const label = asking ? "Pedir confirmação no WhatsApp" : "Enviar lembrete no WhatsApp";
  if (!appointment.customer_whatsapp) return { label, href: null };

  const firstName = appointment.customer_name?.trim().split(/\s+/)[0];
  const when = `${part(start, { weekday: "long" })}, ${part(start, { day: "2-digit", month: "2-digit" })} às ${part(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
  const what = appointment.service_name ? ` de ${appointment.service_name}` : "";
  const who = appointment.professional_name ? `, com ${appointment.professional_name}` : "";
  const text = [
    `Olá${firstName ? `, ${firstName}` : ""}! Aqui é ${companyName}.`,
    asking ? `Seu horário${what} está marcado para ${when}${who}.` : `Lembrete do seu horário${what}: ${when}${who}.`,
    asking ? "Pode confirmar?" : "Até lá!",
  ].join(" ");

  return { label, href: `https://wa.me/${appointment.customer_whatsapp}?text=${encodeURIComponent(text)}` };
}
