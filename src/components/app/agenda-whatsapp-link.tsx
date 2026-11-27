import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { whatsappNotice, type WhatsappAppointment } from "@/lib/agenda/whatsapp";

/** Botão de aviso pelo WhatsApp; com `showHint`, explica como habilitar quando falta o telefone do cliente. */
export function AgendaWhatsappLink({
  appointment,
  companyName,
  now,
  showHint = false,
}: {
  appointment: WhatsappAppointment;
  companyName: string;
  now: Date;
  showHint?: boolean;
}) {
  const notice = whatsappNotice(appointment, companyName, now);
  if (!notice) return null;
  if (!notice.href) {
    return showHint ? (
      <p className="text-xs text-muted-foreground">
        Para avisar pelo WhatsApp,{" "}
        <Link href={`/app/clientes/${appointment.customer_id}`} className="text-primary underline underline-offset-2">
          cadastre um telefone válido do cliente
        </Link>
        .
      </p>
    ) : null;
  }
  return (
    <a
      href={notice.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium hover:bg-emerald-500/20"
    >
      <MessageCircle aria-hidden className="h-4 w-4" />
      {notice.label}
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}
