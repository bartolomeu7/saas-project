import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { PaymentProviderBadge, PaymentStatusBadge } from "@/components/admin/admin-badges";
import { AuditCard, DetailRow } from "@/components/admin/admin-detail-parts";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { voidManualPaymentAction } from "@/lib/admin/actions";
import { parseUuid } from "@/lib/admin/params";
import { getPlatformPaymentDetail, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS } from "@/types/admin";
import { ReverifyPaymentButton } from "./reverify-button";

export const metadata = { title: "Pagamento" };

const OUTCOME_LABELS: Record<string, string> = {
  processed: "Processado",
  payment_not_found: "Pagamento não encontrado",
  ignored: "Ignorado",
  error: "Erro",
};

/**
 * Detalhe de um pagamento. Mostra eventos de pagamento (idempotência) e entregas
 * de webhook SEM payload bruto; documento do pagador mascarado. Reverificar (EvoPay)
 * refaz a consulta server-to-server e anular (manual) é exclusivo de super_admin.
 */
export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const paymentId = parseUuid((await params).id);
  if (!paymentId) notFound();

  const detail = await getPlatformPaymentDetail(paymentId);
  if (!detail) notFound();

  const { payment, events, deliveries } = detail;
  const canVoid = admin.role === "super_admin" && payment.provider === "manual" && payment.status === "paid";
  const canReverify = payment.provider === "evopay" && payment.status !== "paid";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Financeiro"
        title={formatCurrency(payment.amount)}
        description={`${payment.company_name} · ${payment.plan_name}`}
        actions={
          <Link href="/admin/payments" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
            <ArrowLeft className="size-4" strokeWidth={1.75} /> Pagamentos
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamento</CardTitle>
          <CardDescription>Dados registrados pela plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2">
            <DetailRow label="Status">
              <PaymentStatusBadge status={payment.status} />
            </DetailRow>
            <DetailRow label="Origem">
              <PaymentProviderBadge provider={payment.provider} />
            </DetailRow>
            <DetailRow label="Forma">{PAYMENT_METHOD_LABELS[payment.method ?? "pix"] ?? payment.method}</DetailRow>
            <DetailRow label="Empresa">
              <Link href={`/admin/companies/${payment.company_id}`} className="underline-offset-4 hover:underline">
                {payment.company_name}
              </Link>
            </DetailRow>
            <DetailRow label="Plano">{payment.plan_name}</DetailRow>
            <DetailRow label="Valor">{formatCurrency(payment.amount)}</DetailRow>
            {payment.amount_with_tax !== null && payment.amount_with_tax !== payment.amount && (
              <DetailRow label="Valor com taxas">{formatCurrency(payment.amount_with_tax)}</DetailRow>
            )}
            <DetailRow label="Criado em">{formatDateTime(payment.created_at)}</DetailRow>
            {payment.due_at && <DetailRow label="Vencimento da cobrança">{formatDateTime(payment.due_at)}</DetailRow>}
            <DetailRow label="Pago em">{payment.paid_at ? formatDateTime(payment.paid_at) : "—"}</DetailRow>
            {payment.external_reference && <DetailRow label="Referência"><code className="text-xs">{payment.external_reference}</code></DetailRow>}
            {payment.provider_transaction_id && (
              <DetailRow label="ID na EvoPay"><code className="text-xs">{payment.provider_transaction_id}</code></DetailRow>
            )}
            {payment.end_to_end_id && <DetailRow label="End-to-end"><code className="text-xs">{payment.end_to_end_id}</code></DetailRow>}
            {payment.payer_name && <DetailRow label="Pagador">{payment.payer_name}</DetailRow>}
            {payment.payer_document_masked && <DetailRow label="Documento">{payment.payer_document_masked}</DetailRow>}
            {payment.recorded_by_email && <DetailRow label="Registrado por">{payment.recorded_by_email}</DetailRow>}
            {payment.notes && <DetailRow label="Observações">{payment.notes}</DetailRow>}
          </dl>

          {(canReverify || canVoid) && (
            <div className="flex flex-wrap items-start gap-3">
              {canReverify && <ReverifyPaymentButton paymentId={payment.id} />}
              {canVoid && (
                <AdminActionDialog
                  triggerLabel="Anular pagamento manual"
                  triggerVariant="destructive"
                  title="Anular pagamento manual"
                  description="O pagamento passa a Cancelado (a linha não é apagada). O acesso já concedido NÃO é revertido automaticamente — use “Ajustar vencimento” na empresa se necessário."
                  submitLabel="Anular"
                  destructive
                  action={voidManualPaymentAction.bind(null, payment.id)}
                  fields={[
                    {
                      type: "textarea",
                      name: "reason",
                      label: "Motivo",
                      required: true,
                      maxLength: 500,
                      hint: "Fica registrado na auditoria.",
                    },
                  ]}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Eventos do pagamento</CardTitle>
            <CardDescription>Registro de idempotência: o mesmo evento nunca renova o acesso duas vezes.</CardDescription>
          </CardHeader>
          {events.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Processado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.event_id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(event.created_at)}</TableCell>
                    <TableCell>
                      <code className="break-all text-xs">{event.event_type}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.processed ? "success" : "warning"}>{event.processed ? "Sim" : "Não"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Entregas de webhook</CardTitle>
            <CardDescription>Chamadas recebidas da EvoPay para este pagamento.</CardDescription>
          </CardHeader>
          {deliveries.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">Nenhuma entrega registrada.</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebida</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.received_at + delivery.outcome}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(delivery.received_at)}</TableCell>
                    <TableCell>
                      <Badge variant={delivery.outcome === "processed" ? "success" : delivery.outcome === "error" ? "danger" : "muted"}>
                        {OUTCOME_LABELS[delivery.outcome] ?? delivery.outcome}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <AuditCard entries={detail.audit} title="Histórico administrativo do pagamento" />

      <p className="text-xs text-muted-foreground">
        Pagamento registrado em {formatDate(payment.created_at)}. Dados sensíveis (QR Code, payload bruto, documento completo) não são exibidos.
      </p>
    </div>
  );
}
