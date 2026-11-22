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
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { parseEnum, parsePage, type SearchParams } from "@/lib/admin/params";
import { setActiveGatewayAction } from "@/lib/admin/actions";
import { gatewayConfigured, getActiveGateway } from "@/lib/billing/gateway";
import { PAYMENT_GATEWAYS, PAYMENT_GATEWAY_LABELS, type PaymentGateway } from "@/types/billing";
import type { GatewayIntegrationStatus } from "@/types/admin";
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

const GATEWAY_NOTES: Record<PaymentGateway, string> = {
  misticpay: "Pix. Webhook sem assinatura: protegido por token na URL e sempre confirmado na API antes de liberar acesso.",
  syncpay: "Pix e cartão. Webhook assinado (HMAC). Aguardando a liberação do Pix pela API na conta.",
};

function GatewayCard({ gateway, status, active, configured }: { gateway: PaymentGateway; status: GatewayIntegrationStatus; active: boolean; configured: boolean }) {
  const variant = !configured ? "muted" : status.errors_24h > 0 ? "danger" : status.pending_older_1h > 0 ? "warning" : "success";
  const label = !configured ? "Sem credenciais" : status.errors_24h > 0 ? "Com erros" : status.pending_older_1h > 0 ? "Atenção" : "Saudável";
  return (
    <Card className={active ? "border-primary/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {PAYMENT_GATEWAY_LABELS[gateway]}
            {active && <Badge variant="info">Ativo</Badge>}
          </span>
          <Badge variant={variant}>{label}</Badge>
        </CardTitle>
        <CardDescription>{GATEWAY_NOTES[gateway]}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2">
          <DetailRow label="Entregas (24 h)">{status.deliveries_24h}</DetailRow>
          <DetailRow label="Processadas">{status.processed_24h}</DetailRow>
          <DetailRow label="Sem pagamento">{status.unmatched_24h}</DetailRow>
          <DetailRow label="Erros">{status.errors_24h}</DetailRow>
          <DetailRow label="Última entrega">
            {status.last_delivery_at ? `${formatDateTime(status.last_delivery_at)} (${formatRelative(status.last_delivery_at)})` : "Nenhuma"}
          </DetailRow>
          <DetailRow label="Pagamentos pendentes">
            {status.pending_payments}
            {status.pending_older_1h > 0 && <span className="text-warning"> · {status.pending_older_1h} há mais de 1 h</span>}
          </DetailRow>
          <DetailRow label="Último pago">{status.last_paid_at ? formatDateTime(status.last_paid_at) : "—"}</DetailRow>
          <DetailRow label="Eventos (total / sem processar)">
            {status.events_total} / {status.events_unprocessed}
          </DetailRow>
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * Integrações: gateways de pagamento (MisticPay e SyncPay, com a escolha do ativo), Clerk (identidade) e Supabase (banco).
 * Tudo vem do banco (platform_integrations_status e as listas de entregas/eventos):
 * nenhum payload bruto, token ou segredo é exibido. O webhook da SyncPay é assinado (HMAC); o da MisticPay não é, então
 * é protegido por token e confirmado na API. Ambos são idempotentes por evento (payment_events). Se uma entrega falhar,
 * “Reverificar no gateway” no pagamento consulta a transação (contingência).
 */
export default async function AdminIntegrationsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;

  const outcome = parseEnum(searchParams.outcome, OUTCOMES);
  const page = parsePage(searchParams.page);
  const activeGateway = await getActiveGateway();
  const gateway = parseEnum(searchParams.gateway, PAYMENT_GATEWAYS) ?? activeGateway;

  const [status, deliveries, events] = await Promise.all([
    getIntegrationsStatus(),
    listWebhookDeliveries({ provider: gateway, outcome, page }),
    listPaymentEvents({ provider: gateway, page: 1 }),
  ]);
  const { clerk, supabase } = status;
  const isSuperAdmin = admin.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Integrações"
        description="Gateway de pagamento ativo, saúde de MisticPay, SyncPay, Clerk e Supabase, e o histórico de webhooks."
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Gateway de pagamento ativo</CardTitle>
            <Badge variant={gatewayConfigured(activeGateway) ? "success" : "danger"}>
              {PAYMENT_GATEWAY_LABELS[activeGateway]}
              {gatewayConfigured(activeGateway) ? "" : " · sem credenciais"}
            </Badge>
          </div>
          <CardDescription>
            Recebe as NOVAS cobranças de assinatura. Cobranças já criadas continuam no gateway em que nasceram e os dois webhooks seguem
            valendo. O cartão só existe na SyncPay: com a MisticPay ativa, o site oferece apenas Pix.
          </CardDescription>
        </CardHeader>
        {isSuperAdmin && (
          <CardContent>
            <AdminActionDialog
              triggerLabel="Trocar gateway"
              triggerSize="sm"
              title="Trocar o gateway de pagamento"
              description="As próximas cobranças serão criadas no gateway escolhido. A troca fica registrada na auditoria."
              submitLabel="Salvar"
              action={setActiveGatewayAction}
              fields={[
                {
                  type: "select",
                  name: "provider",
                  label: "Gateway",
                  required: true,
                  defaultValue: activeGateway,
                  options: PAYMENT_GATEWAYS.map((value) => ({
                    value,
                    label: `${PAYMENT_GATEWAY_LABELS[value]}${gatewayConfigured(value) ? "" : " (sem credenciais neste ambiente)"}`,
                  })),
                },
                { type: "textarea", name: "reason", label: "Motivo (opcional)", maxLength: 500 },
              ]}
            />
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <GatewayCard gateway="misticpay" status={status.misticpay} active={activeGateway === "misticpay"} configured={gatewayConfigured("misticpay")} />
        <GatewayCard gateway="syncpay" status={status.syncpay} active={activeGateway === "syncpay"} configured={gatewayConfigured("syncpay")} />

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
          Entregas de webhook ({PAYMENT_GATEWAY_LABELS[gateway]})
        </h2>
        <AdminFilters
          basePath="/admin/integrations"
          search={undefined}
          searchPlaceholder=""
          hideSearch
          selects={[
            {
              name: "gateway",
              label: "Gateway",
              allLabel: `Gateway ativo (${PAYMENT_GATEWAY_LABELS[activeGateway]})`,
              value: gateway !== activeGateway ? gateway : undefined,
              options: PAYMENT_GATEWAYS.map((value) => ({ value, label: PAYMENT_GATEWAY_LABELS[value] })),
            },
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
                : `Quando a ${PAYMENT_GATEWAY_LABELS[gateway]} chamar o webhook, cada entrega aparece aqui.`
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
          searchParams={{ outcome, gateway: gateway !== activeGateway ? gateway : undefined }}
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
