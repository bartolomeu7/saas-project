import { Check, Layers, Minus } from "lucide-react";
import { AdminActionDialog, type DialogField } from "@/components/admin/admin-action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createPlanAction, updatePlanAction } from "@/lib/admin/actions";
import { listPlatformPlans, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatCurrency } from "@/lib/format";
import type { PlatformPlanRow } from "@/types/admin";
import { PlanStatusControl } from "./plan-status-control";

export const metadata = { title: "Planos" };

function formatPrice(plan: PlatformPlanRow): string {
  if (plan.price === null) return "Sob consulta";
  if (plan.price === 0) return "Grátis";
  return formatCurrency(plan.price);
}

function formatDuration(plan: PlatformPlanRow): string {
  if (plan.access_duration_days === null) return "Sob consulta";
  const days = plan.access_duration_days;
  return `${days} ${days === 1 ? "dia" : "dias"} de acesso`;
}

const FEATURES: { key: keyof PlatformPlanRow; label: string }[] = [
  { key: "support_enabled", label: "Suporte" },
  { key: "tickets_enabled", label: "Tickets" },
  { key: "exclusive_groups_enabled", label: "Grupos exclusivos" },
  { key: "early_access_enabled", label: "Acesso antecipado" },
];

function planFields(plan?: PlatformPlanRow): DialogField[] {
  return [
    ...(plan
      ? []
      : ([
          {
            type: "text",
            name: "code",
            label: "Código",
            required: true,
            maxLength: 32,
            placeholder: "EX.: PROMO_2026",
            hint: "A-Z, 0-9 e _. Não pode ser alterado depois.",
          },
        ] as DialogField[])),
    { type: "text", name: "name", label: "Nome", required: true, maxLength: 80, defaultValue: plan?.name ?? "" },
    { type: "textarea", name: "description", label: "Descrição", maxLength: 500, defaultValue: plan?.description ?? "" },
    {
      type: "number",
      name: "price",
      label: "Preço (R$)",
      required: plan?.code !== "CUSTOM",
      hint: plan?.code === "CUSTOM" ? "Vazio = sob consulta." : undefined,
      min: 0,
      max: 100000,
      step: "0.01",
      defaultValue: plan ? (plan.price ?? "") : 0,
    },
    {
      type: "number",
      name: "accessDurationDays",
      label: "Duração do acesso (dias)",
      required: plan?.code !== "CUSTOM",
      min: 1,
      max: 3660,
      step: 1,
      defaultValue: plan ? (plan.access_duration_days ?? "") : 30,
    },
    {
      type: "select",
      name: "billingInterval",
      label: "Intervalo de cobrança (informativo)",
      emptyLabel: "Não informado",
      defaultValue: plan?.billing_interval ?? "",
      options: [
        { value: "month", label: "Mensal" },
        { value: "year", label: "Anual" },
      ],
    },
    {
      type: "number",
      name: "additionalUserLimit",
      label: "Usuários adicionais",
      required: true,
      min: 0,
      max: 1000,
      step: 1,
      defaultValue: plan?.additional_user_limit ?? 0,
    },
    {
      type: "number",
      name: "sortOrder",
      label: "Ordem de exibição",
      required: true,
      min: 0,
      max: 10000,
      step: 1,
      defaultValue: plan?.sort_order ?? 0,
      hint: "Menor aparece primeiro.",
    },
    {
      type: "checkbox",
      name: "trial",
      label: "Plano de teste grátis",
      defaultChecked: plan?.trial ?? false,
      hint: plan && (plan.subscriptions_count > 0 || plan.payments_count > 0) ? "Não pode ser alterado: o plano já foi utilizado." : undefined,
    },
    { type: "checkbox", name: "supportEnabled", label: "Suporte", defaultChecked: plan?.support_enabled ?? false },
    { type: "checkbox", name: "ticketsEnabled", label: "Tickets", defaultChecked: plan?.tickets_enabled ?? false },
    {
      type: "checkbox",
      name: "exclusiveGroupsEnabled",
      label: "Grupos exclusivos",
      defaultChecked: plan?.exclusive_groups_enabled ?? false,
    },
    {
      type: "checkbox",
      name: "earlyAccessEnabled",
      label: "Acesso antecipado",
      defaultChecked: plan?.early_access_enabled ?? false,
    },
  ];
}

/**
 * Catálogo de planos. Leitura via list_platform_plans() (admin e super_admin, com
 * contagem de assinaturas/pagamentos); criar, editar e ativar/desativar são
 * SUPER_ADMIN ONLY (RPCs revalidam no banco, validam faixas e auditam). Planos
 * nunca são excluídos — só desativados — para preservar histórico financeiro.
 */
export default async function AdminPlansPage() {
  const admin = await requirePlatformAdmin();
  const plans = await listPlatformPlans();
  const isSuper = admin.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title="Planos"
        description="Catálogo de planos do Prime Ges: preço, duração, limites e recursos."
        actions={
          isSuper ? (
            <AdminActionDialog
              triggerLabel="Novo plano"
              triggerVariant="default"
              title="Novo plano"
              description="O plano nasce ativo e aparece para contratação. Planos não podem ser excluídos, apenas desativados."
              submitLabel="Criar plano"
              action={createPlanAction}
              fields={planFields()}
            />
          ) : undefined
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum plano encontrado"
          description="Não há planos cadastrados."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead className="text-right">Usuários adicionais</TableHead>
                <TableHead>Recursos</TableHead>
                <TableHead className="text-right">Uso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.plan_id}>
                  <TableCell>
                    <div className="flex min-w-[10rem] flex-col">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {plan.name}
                        {plan.trial && <Badge variant="info">Teste</Badge>}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {plan.code} · ordem {plan.sort_order}
                      </span>
                      {isSuper && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <AdminActionDialog
                            triggerLabel="Editar"
                            triggerSize="xs"
                            title={`Editar ${plan.name}`}
                            description="O código não pode ser alterado. Mudanças de preço e duração valem para novas cobranças; pagamentos antigos mantêm o valor original."
                            submitLabel="Salvar"
                            action={updatePlanAction.bind(null, plan.plan_id)}
                            fields={planFields(plan)}
                          />
                          <PlanStatusControl
                            planId={plan.plan_id}
                            planName={plan.name}
                            active={plan.status === "active"}
                            isProtected={plan.is_protected}
                            activeSubscriptions={plan.active_subscriptions_count}
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.status === "active" ? "success" : "muted"}>
                      {plan.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">{formatPrice(plan)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDuration(plan)}</TableCell>
                  <TableCell className="text-right tabular-nums">{plan.additional_user_limit}</TableCell>
                  <TableCell>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {FEATURES.map(({ key, label }) => {
                        const enabled = Boolean(plan[key]);
                        return (
                          <li
                            key={key}
                            className={`flex items-center gap-1 ${enabled ? "text-foreground" : "text-muted-foreground/60"}`}
                          >
                            {enabled ? (
                              <Check className="size-3 text-success" strokeWidth={2} aria-label="Incluído" />
                            ) : (
                              <Minus className="size-3" strokeWidth={2} aria-label="Não incluído" />
                            )}
                            {label}
                          </li>
                        );
                      })}
                    </ul>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {plan.subscriptions_count} assinatura(s)
                    <span className="block text-xs text-muted-foreground">
                      {plan.active_subscriptions_count} ativa(s) · {plan.payments_count} pagamento(s)
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
