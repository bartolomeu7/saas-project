import { Check, Layers, Minus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/admin/queries";
import { getPlans } from "@/lib/billing/queries";
import type { Plan } from "@/types/billing";

export const metadata = { title: "Planos" };

function formatPrice(plan: Plan): string {
  if (plan.price === null) return "Sob consulta";
  if (plan.price === 0) return "Grátis";
  return plan.price.toLocaleString("pt-BR", { style: "currency", currency: plan.currency || "BRL" });
}

function formatDuration(plan: Plan): string {
  if (plan.access_duration_days === null) return "Sob consulta";
  const days = plan.access_duration_days;
  return `${days} ${days === 1 ? "dia" : "dias"} de acesso`;
}

const FEATURES: { key: keyof Plan; label: string }[] = [
  { key: "support_enabled", label: "Suporte" },
  { key: "tickets_enabled", label: "Tickets" },
  { key: "exclusive_groups_enabled", label: "Grupos exclusivos" },
  { key: "early_access_enabled", label: "Acesso antecipado" },
];

/**
 * Catálogo de planos (somente leitura nesta etapa). Reaproveita getPlans() do
 * módulo de billing — a mesma fonte da tela de assinatura da empresa — com
 * `includeInactive` para o admin ver também os planos desativados. Criar,
 * editar e (des)ativar planos exige RPCs com validação e auditoria próprias
 * (planejado para a próxima etapa); nenhum grant de escrita é aberto ao cliente.
 */
export default async function AdminPlansPage() {
  await requirePlatformAdmin();
  const plans = await getPlans({ includeInactive: true });

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title="Planos"
        description="Catálogo de planos do Prime Ges: preço, duração, limites e recursos."
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum plano encontrado"
          description="Não há planos cadastrados ou não foi possível carregá-los agora."
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex min-w-[10rem] flex-col">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {plan.name}
                        {plan.trial && <Badge variant="info">Teste</Badge>}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{plan.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.status === "active" ? "success" : "muted"}>
                      {plan.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {formatPrice(plan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDuration(plan)}
                  </TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
