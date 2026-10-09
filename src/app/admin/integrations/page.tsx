import Link from "next/link";
import { Plug } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { DetailRow } from "@/components/admin/admin-detail-parts";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseEnum, parsePage, type SearchParams } from "@/lib/admin/params";
import {
  ADMIN_PAGE_SIZE,
  getIntegrationsStatus,
  listPaymentEvents,
  listWebhookDeliveries,
  requirePlatformAdmin,
} from "@/lib/admin/queries";
import { formatDateTime, formatRelative } from "@/lib/format";

export const metadata = { title: "Integrações" };

const OUTCOMES = ["processed", "payment_not_found", "ignored", "error"] as const;
const OUTCOME_LABELS: Record<(typeof OUTCOMES)[number], string> = {
  processed: "Processado",
  payment_not_found: "Pagamento não encontrado",
  ignored: "Ignorado",
  error: "Erro",
};
const OUTCOME_VARIANTS = { processed: "success", payment_not_found: "warning", ignored: "muted", error: "danger" } as const;

/**
 * Integrações: EvoPay (webhook + pagamentos), Clerk (identidade) e Supabase (banco).
 * Tudo vem do banco (platform_integrations_status e as listas de entregas/eventos):
 * nenhum payload bruto, token ou segredo é exibido. O webhook da EvoPay não é
 * assinado; por isso cada entrega é só um aviso e o status real é SEMPRE reconfirmado
 * por consulta server-to-server (idempotente via payment_events). Reprocessar =
 * “Reverificar na EvoPay” no pagamento.
 */
export default async function AdminIntegrationsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const outcome = parseEnum(searchParams.outcome, OUTCOMES);
  const page = parsePage(searchParams.page);

  const [status, deliveries, events] = await Promise.all([
    getIntegrationsStatus(),
    listWebhookDeliveries({ provider: "evopay", outcome, page }),
    listPaymentEvents({ provider: "evopay", page: 1 }),
  ]);
  const { evopay, clerk, supabase } = status;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Integrações"
        description="Saúde de EvoPay, Clerk e Supabase, e o histórico de webhooks."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              EvoPay
              <Badge variant={evopay.errors_24h > 0 ? "danger" : evopay.pending_older_1h > 0 ? "warning" : "success"}>
                {evopay.errors_24h > 0 ? "Com erros" : evopay.pending_older_1h > 0 ? "Atenção" : "Saudável"}
              </Badge>
            </CardTitle>
            <CardDescription>Pagamentos Pix e webhook (últimas 24 h).</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              <DetailRow label="Entregas (24 h)">{evopay.deliveries_24h}</DetailRow>
              <DetailRow label="Processadas">{evopay.processed_24h}</DetailRow>
              <DetailRow label="Sem pagamento">{evopay.unmatched_24h}</DetailRow>
              <DetailRow label="Erros">{evopay.errors_24h}</DetailRow>
              <DetailRow label="Última entrega">
                {evopay.last_delivery_at ? `${formatDateTime(evopay.last_delivery_at)} (${formatRelative(evopay.last_delivery_at)})` : "Nenhuma"}
              </DetailRow>
              <DetailRow label="Pagamentos pendentes">
                {evopay.pending_payments}
                {evopay.pending_older_1h > 0 && (
                  <span className="text-warning"> · {evopay.pending_older_1h} há mais de 1 h</span>
                )}
              </DetailRow>
              <DetailRow label="Último pago">{evopay.last_paid_at ? formatDateTime(evopay.last_paid_at) : "—"}</DetailRow>
              <DetailRow label="Eventos (total / sem processar)">
                {evopay.events_total} / {evopay.events_unprocessed}
              </DetailRow>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Clerk
              <Badge variant="success">Identidade</Badge>
            </CardTitle>
            <CardDescription>Autenticação; o banco guarda só o vínculo com o perfil.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              <DetailRow label="Perfis">{clerk.profiles_total}</DetailRow>
              <DetailRow label="Vinculados ao Clerk">{clerk.profiles_linked}</DetailRow>
              <DetailRow label="Sem vínculo (legados)">{clerk.profiles_unlinked}</DetailRow>
              <DetailRow label="Último login registrado">{clerk.last_login_at ? formatDateTime(clerk.last_login_at) : "—"}</DetailRow>
              <DetailRow label="Webhook do Clerk">
                {clerk.webhook_configured ? "Configurado" : "Não utilizado (a sessão é validada por JWKS)"}
              </DetailRow>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Supabase
              <Badge variant={supabase.database === "ok" ? "success" : "danger"}>
                {supabase.database === "ok" ? "Respondendo" : "Indisponível"}
              </Badge>
            </CardTitle>
            <CardDescription>Banco, RLS e RPCs.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              <DetailRow label="Verificado em">{formatDateTime(supabase.checked_at)}</DetailRow>
              <DetailRow label="Empresas">{supabase.companies}</DetailRow>
              <DetailRow label="Registros de auditoria">{supabase.audit_logs_total}</DetailRow>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="deliveries-heading" className="flex flex-col gap-3">
        <h2 id="deliveries-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Entregas de webhook (EvoPay)
        </h2>
        <AdminFilters
          basePath="/admin/integrations"
          search={undefined}
          searchPlaceholder=""
          hideSearch
          selects={[
            {
              name: "outcome",
              label: "Resultado",
              allLabel: "Todos os resultados",
              value: outcome,
              options: OUTCOMES.map((value) => ({ value, label: OUTCOME_LABELS[value] })),
            },
          ]}
        />

        {deliveries.rows.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="Nenhuma entrega registrada"
            description={
              outcome
                ? "Nenhuma entrega com este resultado."
                : "Quando a EvoPay chamar o webhook, cada entrega aparece aqui."
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebida</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Empresa / pagamento</TableHead>
                  <TableHead>ID externo</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.rows.map((delivery) => (
                  <TableRow key={delivery.delivery_id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(delivery.received_at)}</TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_VARIANTS[delivery.outcome]}>{OUTCOME_LABELS[delivery.outcome]}</Badge>
                    </TableCell>
                    <TableCell>
                      {delivery.payment_id ? (
                        <Link href={`/admin/payments/${delivery.payment_id}`} className="underline-offset-4 hover:underline">
                          {delivery.company_name ?? "Ver pagamento"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate font-mono text-xs text-muted-foreground" title={delivery.external_id ?? undefined}>
                      {delivery.external_id ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground" title={delivery.detail ?? undefined}>
                      {delivery.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <Pagination
          page={page}
          pageSize={ADMIN_PAGE_SIZE}
          total={deliveries.total}
          basePath="/admin/integrations"
          searchParams={{ outcome }}
          itemLabel="entrega"
          itemLabelPlural="entregas"
        />
      </section>

      <section aria-labelledby="events-heading" className="flex flex-col gap-3">
        <h2 id="events-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Eventos de pagamento (idempotência)
        </h2>
        {events.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento de pagamento registrado ainda.</p>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Processado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.rows.map((event) => (
                  <TableRow key={event.event_row_id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(event.created_at)}</TableCell>
                    <TableCell>
                      <code className="break-all text-xs">{event.event_id}</code>
                    </TableCell>
                    <TableCell>
                      {event.payment_id ? (
                        <Link href={`/admin/payments/${event.payment_id}`} className="underline-offset-4 hover:underline">
                          {event.company_name ?? "Ver pagamento"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.processed ? "success" : "warning"}>{event.processed ? "Sim" : "Não"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
