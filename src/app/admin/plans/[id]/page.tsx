import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPlatformPlanHistory, listPlatformPlans, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";
import { PlanEditor } from "../plan-editor";

export const metadata = { title: "Plano" };

const ACTION_LABELS: Record<string, string> = {
  "platform.plan.created": "Plano criado",
  "platform.plan.updated": "Dados do plano alterados",
  "platform.plan.details_updated": "Apresentação / promoção / benefícios alterados",
  "platform.plan.status_changed": "Situação alterada",
};

function describe(metadata: Record<string, unknown>): string {
  const from = (metadata.from ?? null) as Record<string, unknown> | null;
  const to = (metadata.to ?? null) as Record<string, unknown> | null;
  if (!to) return "";
  return Object.keys(to)
    .map((key) => {
      const after = to[key];
      if (key === "benefits" && after && typeof after === "object") {
        const b = after as Record<string, number>;
        return `benefícios: +${b.added ?? 0} · ~${b.edited ?? 0} · −${b.removed ?? 0} (${b.before_count ?? "?"} → ${b.after_count ?? "?"})`;
      }
      const before = from?.[key];
      return before === undefined ? `${key}: ${JSON.stringify(after)}` : `${key}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`;
    })
    .join("; ");
}

/**
 * Detalhe do plano: editor (super_admin edita; admin só lê), pré-visualização do cartão público e histórico de
 * alterações (quem, quando, o que mudou — sem segredos). O histórico vem do audit_logs via list_platform_plan_history.
 */
export default async function AdminPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const plans = await listPlatformPlans();
  const plan = plans.find((p) => p.plan_id === id);
  if (!plan) notFound();
  const history = await getPlatformPlanHistory(id);
  const isSuper = admin.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Planos"
        title={plan.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{plan.code}</span>
            <Badge variant={plan.status === "active" ? "success" : "muted"}>{plan.status === "active" ? "Ativo" : "Inativo"}</Badge>
            <span className="text-xs text-muted-foreground">
              {plan.subscriptions_count} assinatura(s) · {plan.payments_count} pagamento(s) — preservados em qualquer alteração.
            </span>
            <Link href="/admin/plans" className="text-xs font-medium text-primary hover:underline">
              ← Voltar à lista
            </Link>
          </span>
        }
      />
      {!isSuper && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          Somente super administradores alteram planos. Você pode consultar os dados, a pré-visualização e o histórico.
        </p>
      )}
      <PlanEditor plan={plan} readOnly={!isSuper} activeSubscriptions={plan.active_subscriptions_count} />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Histórico de alterações</CardTitle>
          <CardDescription>
            Quem alterou, quando e quais campos mudaram. Preços e regras antigos ficam aqui para explicar cobranças históricas (cada
            pagamento guarda o valor cobrado).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Operação</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead>O que mudou</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell className="text-sm">{ACTION_LABELS[row.action] ?? row.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.actor_email ?? "Administrador"}</TableCell>
                    <TableCell className="max-w-[32rem] break-words text-xs text-muted-foreground">{describe(row.metadata) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
