import Link from "next/link";
import { SubscriptionStatusBadge } from "@/components/app/subscription-status-badge";
import { AuditCategoryBadge, PaymentProviderBadge, PaymentStatusBadge } from "@/components/admin/admin-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type AuditEntry, type PaymentBrief, type SubscriptionSummary } from "@/types/admin";

/** Linha rótulo/valor das fichas de detalhe. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground sm:text-right">{children}</dd>
    </div>
  );
}

export function SubscriptionCard({
  subscription,
  action,
  emptyText = "Esta empresa ainda não tem assinatura.",
}: {
  subscription: SubscriptionSummary | null;
  action?: React.ReactNode;
  emptyText?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assinatura</CardTitle>
        <CardDescription>Fonte de verdade do acesso ao produto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {subscription ? (
          <dl className="flex flex-col gap-2">
            <DetailRow label="Plano">{subscription.plan.name}</DetailRow>
            <DetailRow label="Situação">
              {!subscription.access_active && (subscription.status === "active" || subscription.status === "trialing") ? (
                <Badge variant="danger">Acesso expirado</Badge>
              ) : (
                <SubscriptionStatusBadge status={subscription.status} />
              )}
            </DetailRow>
            <DetailRow label="Acesso">{subscription.access_active ? "Liberado" : "Bloqueado"}</DetailRow>
            <DetailRow label="Início">{formatDate(subscription.starts_at)}</DetailRow>
            <DetailRow label="Vencimento">
              {subscription.lifetime || !subscription.expires_at ? (
                <span>
                  Sem vencimento <Badge variant="secondary">Vitalício</Badge>
                </span>
              ) : (
                <>
                  {formatDate(subscription.expires_at)}
                  {subscription.access_active && subscription.days_left !== null && (
                    <span className="text-muted-foreground"> · restam {subscription.days_left} dia(s)</span>
                  )}
                </>
              )}
            </DetailRow>
            {subscription.cancelled_at && <DetailRow label="Cancelada em">{formatDate(subscription.cancelled_at)}</DetailRow>}
            <DetailRow label="Origem">{subscription.provider ?? "—"}</DetailRow>
            <DetailRow label="Atualizada em">{formatDateTime(subscription.updated_at)}</DetailRow>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}

/** Categorias de auditoria que descrevem o histórico de acesso/licença/cobrança manual de uma empresa. */
const ACCESS_HISTORY_CATEGORIES = new Set(["ACCESS_EXTENSION", "SUBSCRIPTION_CHANGE", "PLAN_CHANGE", "MANUAL_PAYMENT"]);

export function AccessHistoryCard({ entries }: { entries: AuditEntry[] }) {
  const history = entries.filter((entry) => ACCESS_HISTORY_CATEGORIES.has(entry.category));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de concessões e licenças</CardTitle>
        <CardDescription>Concessões de acesso, trocas de plano, cancelamentos e pagamentos manuais (quem fez, quando e por quê).</CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma concessão ou alteração de licença registrada.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AuditCategoryBadge category={entry.category} />
                  <code className="text-xs text-muted-foreground">{entry.action}</code>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)} · {entry.actor_name ?? entry.actor_email ?? "sistema"}
                </p>
                {metadataSummary(entry.metadata) && (
                  <p className="break-words text-xs text-foreground/80">{metadataSummary(entry.metadata)}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function PaymentsCard({ payments, empty = "Nenhum pagamento registrado." }: { payments: PaymentBrief[]; empty?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Pagamentos recentes</CardTitle>
        <CardDescription>Últimos 10 pagamentos da empresa (EvoPay e manuais).</CardDescription>
      </CardHeader>
      {payments.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">{empty}</p>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/admin/payments/${payment.id}`} className="underline-offset-4 hover:underline">
                    {formatDate(payment.paid_at ?? payment.created_at)}
                  </Link>
                </TableCell>
                <TableCell>{payment.plan_name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PaymentProviderBadge provider={payment.provider} />
                    {payment.method && (
                      <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={payment.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatCurrency(payment.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** Resumo legível de uma entrada de auditoria: só campos escalares simples do metadata (já sem chaves sensíveis). */
export function metadataSummary(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("_")) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}: ${String(value).slice(0, 80)}`);
    }
    if (parts.length >= 4) break;
  }
  return parts.join(" · ");
}

export function AuditCard({ entries, title = "Histórico administrativo" }: { entries: AuditEntry[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Últimas operações administrativas registradas (segredos nunca são exibidos).</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma operação registrada.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AuditCategoryBadge category={entry.category} />
                  <code className="text-xs text-muted-foreground">{entry.action}</code>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)} · {entry.actor_email ?? "sistema"}
                </p>
                {metadataSummary(entry.metadata) && (
                  <p className="break-words text-xs text-foreground/80">{metadataSummary(entry.metadata)}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
