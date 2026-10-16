"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRequestKey } from "@/components/admin/use-request-key";
import { grantLicenseAction } from "@/lib/admin/actions";
import { formatCurrency } from "@/lib/format";

export type LicenseKind = "thirty_days" | "plan_period" | "custom_days" | "lifetime";

export interface LicensePlanOption {
  id: string;
  code: string;
  name: string;
  accessDurationDays: number | null;
  price: number | null;
  lifetime: boolean;
}

/**
 * Concessão de acesso SEM pagamento, num único diálogo: 30 dias, período de um plano (mensal/trimestral/anual, com a
 * duração REAL configurada no plano), dias personalizados ou acesso vitalício (só super_admin). Exige motivo e
 * confirmação explícita; a chave de idempotência impede que um duplo clique ou um retry conceda duas vezes. Os campos
 * e avisos são só UX: o banco (admin_grant_license) revalida papel, limites, plano e estado e grava a auditoria.
 */
export function LicenseGrantDialog({
  companyId,
  plans,
  currentPlanId,
  hasSubscription,
  alreadyLifetime,
  isSuperAdmin,
  maxFreeDays,
}: {
  companyId: string;
  plans: LicensePlanOption[];
  currentPlanId: string | null;
  hasSubscription: boolean;
  alreadyLifetime: boolean;
  isSuperAdmin: boolean;
  maxFreeDays: number;
}) {
  const router = useRouter();
  const { key: requestKey, renew } = useRequestKey();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LicenseKind>("thirty_days");
  const [planId, setPlanId] = useState<string>(hasSubscription ? "" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const timedPlans = useMemo(() => plans.filter((plan) => !plan.lifetime), [plans]);
  const periodPlans = useMemo(() => timedPlans.filter((plan) => plan.accessDurationDays !== null), [timedPlans]);
  const lifetimePlan = plans.find((plan) => plan.lifetime) ?? null;
  const selectedPlan = timedPlans.find((plan) => plan.id === planId) ?? null;
  const maxDays = isSuperAdmin ? 365 : maxFreeDays;

  const kindOptions: { value: LicenseKind; label: string }[] = [
    { value: "thirty_days", label: "30 dias de acesso" },
    { value: "plan_period", label: "Período de um plano (mensal, trimestral, anual)" },
    { value: "custom_days", label: "Período personalizado (dias)" },
    ...(isSuperAdmin && lifetimePlan ? [{ value: "lifetime" as const, label: "Vitalício (acesso permanente)" }] : []),
  ];

  const periodDays = selectedPlan?.accessDurationDays ?? null;
  const overLimit = !isSuperAdmin && kind === "plan_period" && periodDays !== null && periodDays > maxFreeDays;
  const needsPlanOnCreate = !hasSubscription && kind !== "lifetime";

  function describe(): string {
    switch (kind) {
      case "thirty_days":
        return "Soma 30 dias ao vencimento atual (ou a partir de hoje, se estiver vencido). Não registra pagamento.";
      case "plan_period":
        return selectedPlan && periodDays
          ? `Soma ${periodDays} dias (duração configurada no plano ${selectedPlan.name}${selectedPlan.price ? `, ${formatCurrency(selectedPlan.price)}` : ""}) e passa a empresa para este plano. Não registra pagamento.`
          : "Escolha o plano: a duração usada é a configurada nele.";
      case "custom_days":
        return `Soma exatamente os dias informados (1 a ${maxDays}). Não é o plano trimestral/anual: o plano da empresa só muda se você escolher um.`;
      case "lifetime":
        return "Concede acesso permanente, sem vencimento, e substitui o período atual. Não entra na receita recorrente. Para encerrar depois, atribua um plano com prazo ou cancele a assinatura.";
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("kind", kind);
    formData.set("requestKey", requestKey);
    setError(null);

    startTransition(async () => {
      try {
        const result = await grantLicenseAction(companyId, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(result.success ?? "Concessão registrada.");
        renew();
        setOpen(false);
        setKind("thirty_days");
        router.refresh();
      } catch {
        setError("Não foi possível concluir a operação. Tente novamente: a concessão não será duplicada.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Conceder acesso
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Conceder acesso</DialogTitle>
            <DialogDescription>
              Libera acesso sem pagamento. Para um pagamento recebido, use &quot;Registrar pagamento&quot;.
            </DialogDescription>
          </DialogHeader>

          {alreadyLifetime && (
            <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              Esta empresa já possui acesso vitalício: não há prazo a estender. Para mudar, atribua um plano com prazo
              (super administrador) ou cancele a assinatura.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="lic-kind">Tipo de concessão *</Label>
            <NativeSelect id="lic-kind" value={kind} onChange={(event) => setKind(event.target.value as LicenseKind)}>
              {kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{describe()}</p>
          </div>

          {kind !== "lifetime" && (
            <div className="grid gap-1.5">
              <Label htmlFor="lic-plan">
                Plano{kind === "plan_period" || needsPlanOnCreate ? " *" : ""}
              </Label>
              <NativeSelect
                id="lic-plan"
                name="planId"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                required={kind === "plan_period" || needsPlanOnCreate}
              >
                <option value="">{kind === "plan_period" || needsPlanOnCreate ? "Selecione" : "Manter o plano atual"}</option>
                {(kind === "plan_period" ? periodPlans : timedPlans).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                    {kind === "plan_period" && plan.accessDurationDays ? ` (${plan.accessDurationDays} dias)` : ""}
                    {plan.id === currentPlanId ? " — atual" : ""}
                  </option>
                ))}
              </NativeSelect>
              {needsPlanOnCreate && <p className="text-xs text-muted-foreground">A empresa ainda não tem assinatura: escolha o plano.</p>}
            </div>
          )}

          {kind === "custom_days" && (
            <div className="grid gap-1.5">
              <Label htmlFor="lic-days">Dias *</Label>
              <Input id="lic-days" name="days" type="number" inputMode="numeric" min={1} max={maxDays} step={1} required defaultValue={Math.min(30, maxDays)} />
              <p className="text-xs text-muted-foreground">
                {isSuperAdmin ? "Super administrador: até 365 dias por operação." : `Administrador: até ${maxFreeDays} dias sem pagamento.`}
              </p>
            </div>
          )}

          {overLimit && (
            <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              Este período ({periodDays} dias) excede o limite de concessão gratuita do administrador ({maxFreeDays} dias).
              Registre o pagamento manual ou peça a um super administrador.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="lic-reason">Motivo *</Label>
            <Textarea
              id="lic-reason"
              name="reason"
              required
              maxLength={500}
              rows={3}
              placeholder="Ex.: cortesia de suporte, acordo comercial, parceria..."
            />
            <p className="text-xs text-muted-foreground">Fica registrado na auditoria, com o seu usuário.</p>
          </div>

          <div className="flex items-start gap-2">
            <input id="lic-confirm" name="confirm" type="checkbox" required className="mt-1 size-4 accent-[hsl(var(--primary))]" />
            <Label htmlFor="lic-confirm" className="leading-snug">
              Confirmo que esta concessão foi autorizada e que não há pagamento a registrar.
            </Label>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || alreadyLifetime || overLimit}>
              {pending ? "Aguarde..." : kind === "lifetime" ? "Conceder vitalício" : "Conceder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
