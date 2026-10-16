"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { PricingCard } from "@/components/marketing/pricing-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { savePlanAction } from "@/lib/admin/actions";
import { BENEFIT_MAX, BENEFIT_TEXT_MAX, brasiliaLocalToIso, isoToBrasiliaLocal, parseMoney } from "@/lib/admin/plan-form";
import { discountPercent, promoState, savingsAmount, toPricingView } from "@/lib/billing/pricing-display";
import type { PlatformPlanRow } from "@/types/admin";
import type { PublicPlan } from "@/types/billing";

interface BenefitRow {
  key: string;
  id?: string;
  text: string;
  highlighted: boolean;
  visible: boolean;
  included: boolean;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  price: string;
  accessDurationDays: string;
  billingInterval: string;
  additionalUserLimit: string;
  sortOrder: string;
  trial: boolean;
  supportEnabled: boolean;
  ticketsEnabled: boolean;
  exclusiveGroupsEnabled: boolean;
  earlyAccessEnabled: boolean;
  status: "active" | "inactive";
  publicVisible: boolean;
  tagline: string;
  highlight: string;
  ctaLabel: string;
  contactUrl: string;
  benefitsTitle: string;
  comparePrice: string;
  promoEnabled: boolean;
  promoStartsAt: string;
  promoEndsAt: string;
  showComparePrice: boolean;
  showDiscountPercent: boolean;
  applyLimitsToExisting: boolean;
  benefits: BenefitRow[];
}

let rowSeq = 0;
const newKey = () => `b${++rowSeq}`;
const moneyText = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

function initialState(plan?: PlatformPlanRow): FormState {
  return {
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: plan ? moneyText(plan.price) : "",
    accessDurationDays: plan?.access_duration_days != null ? String(plan.access_duration_days) : plan ? "" : "31",
    billingInterval: plan?.billing_interval ?? "",
    additionalUserLimit: String(plan?.additional_user_limit ?? 0),
    sortOrder: String(plan?.sort_order ?? 100),
    trial: plan?.trial ?? false,
    supportEnabled: plan?.support_enabled ?? false,
    ticketsEnabled: plan?.tickets_enabled ?? false,
    exclusiveGroupsEnabled: plan?.exclusive_groups_enabled ?? false,
    earlyAccessEnabled: plan?.early_access_enabled ?? false,
    status: plan?.status ?? "active",
    publicVisible: plan?.public_visible ?? true,
    tagline: plan?.tagline ?? "",
    highlight: plan?.highlight ?? "",
    ctaLabel: plan?.cta_label ?? "",
    contactUrl: plan?.contact_url ?? "",
    benefitsTitle: plan?.benefits_title ?? "",
    comparePrice: plan ? moneyText(plan.compare_price) : "",
    promoEnabled: plan?.promo_enabled ?? false,
    promoStartsAt: isoToBrasiliaLocal(plan?.promo_starts_at ?? null),
    promoEndsAt: isoToBrasiliaLocal(plan?.promo_ends_at ?? null),
    showComparePrice: plan?.show_compare_price ?? true,
    showDiscountPercent: plan?.show_discount_percent ?? true,
    applyLimitsToExisting: false,
    benefits: (plan?.benefits ?? []).map((b) => ({ key: newKey(), id: b.id, text: b.text, highlighted: b.highlighted, visible: b.visible, included: b.included })),
  };
}

/** Monta, só para a PRÉ-VISUALIZAÇÃO, o que o catálogo público devolveria para o estado atual do formulário. */
function previewPlan(form: FormState, plan?: PlatformPlanRow): PublicPlan {
  const price = parseMoney(form.price);
  const compare = parseMoney(form.comparePrice);
  const priceN = price !== null && Number.isFinite(price) ? price : null;
  const compareN = compare !== null && Number.isFinite(compare) ? compare : null;
  let startsIso: string | null = null;
  let endsIso: string | null = null;
  try { startsIso = brasiliaLocalToIso(form.promoStartsAt); endsIso = brasiliaLocalToIso(form.promoEndsAt); } catch { /* data ainda incompleta */ }
  const active = promoState(form.promoEnabled, startsIso, endsIso) === "active";
  const pct = active ? discountPercent(priceN, compareN) : null;
  const kind = plan?.kind ?? (form.trial ? "trial" : "standard");
  return {
    id: plan?.plan_id ?? "preview",
    code: plan?.code ?? form.code,
    name: form.name || "Nome do plano",
    description: form.description || null,
    price: kind === "custom" ? null : priceN,
    currency: "BRL",
    access_duration_days: form.accessDurationDays ? Number(form.accessDurationDays) || null : null,
    additional_user_limit: Number(form.additionalUserLimit) || 0,
    trial: form.trial,
    support_enabled: form.supportEnabled,
    tickets_enabled: form.ticketsEnabled,
    exclusive_groups_enabled: form.exclusiveGroupsEnabled,
    early_access_enabled: form.earlyAccessEnabled,
    status: form.status,
    kind,
    tagline: form.tagline || null,
    highlight: form.highlight === "popular" || form.highlight === "value" ? form.highlight : null,
    cta_label: form.ctaLabel || null,
    contact_url: form.contactUrl || null,
    benefits_title: form.benefitsTitle || null,
    sort_order: Number(form.sortOrder) || 0,
    compare_price: pct !== null && form.showComparePrice ? compareN : null,
    discount_percent: pct !== null && form.showDiscountPercent ? pct : null,
    savings_amount: pct !== null && form.showDiscountPercent ? savingsAmount(priceN, compareN) : null,
    promo_ends_at: active ? endsIso : null,
    benefits: form.benefits.filter((b) => b.visible && b.text.trim()).map((b) => ({ text: b.text.trim(), highlighted: b.highlighted, included: b.included })),
  };
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Check({ id, checked, onChange, label, hint, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-[hsl(var(--primary))]" />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Editor completo de plano (super_admin cria/edita; admin vê em modo leitura). Os campos são só UX: a Server Action
 * valida o formato e a RPC admin_save_plan é a autoridade (permissão, preço mínimo, desconto válido, benefícios...).
 * A pré-visualização usa o MESMO componente do site, mas é calculada aqui só para conferência — o site mostra o que o
 * banco entrega depois de salvo.
 */
export function PlanEditor({ plan, readOnly = false, activeSubscriptions = 0 }: { plan?: PlatformPlanRow; readOnly?: boolean; activeSubscriptions?: number }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(plan));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCustom = plan?.kind === "custom";
  const isLifetime = plan?.kind === "lifetime";
  const isTrial = form.trial;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const lock = readOnly || pending;

  const preview = useMemo(() => toPricingView(previewPlan(form, plan)), [form, plan]);
  const pct = discountPercent(parseMoney(form.price), parseMoney(form.comparePrice));

  function moveBenefit(index: number, delta: number) {
    setForm((f) => {
      const next = [...f.benefits];
      const target = index + delta;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...f, benefits: next };
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          ...form,
          code: plan ? undefined : form.code,
          benefits: form.benefits.map((b) => ({ ...(b.id ? { id: b.id } : {}), text: b.text, highlighted: b.highlighted, visible: b.visible, included: b.included })),
        };
        const result = await savePlanAction(plan?.plan_id ?? null, payload);
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(result.success ?? "Plano salvo.");
        if (!plan && result.planId) router.push(`/admin/plans/${result.planId}`);
        else router.refresh();
      } catch {
        setError("Não foi possível salvar o plano. Tente novamente.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações gerais</CardTitle>
            <CardDescription>Identificação, texto comercial e situação do plano. O código não pode ser alterado depois de criado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome comercial *" htmlFor="pl-name">
              <Input id="pl-name" value={form.name} maxLength={80} required disabled={lock} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Identificador interno *" htmlFor="pl-code" hint={plan ? "Imutável." : "A-Z, 0-9 e _ (ex.: PROMO_2026)."}>
              <Input id="pl-code" value={form.code} maxLength={32} required={!plan} disabled={lock || Boolean(plan)} onChange={(e) => set("code", e.target.value.toUpperCase())} className="font-mono" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descrição" htmlFor="pl-desc">
                <Textarea id="pl-desc" value={form.description} rows={3} maxLength={500} disabled={lock} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
            <Field label="Texto auxiliar / chamada comercial" htmlFor="pl-tag" hint="Selo curto no cartão (até 60 caracteres). Ex.: Mais escolhido.">
              <Input id="pl-tag" value={form.tagline} maxLength={60} disabled={lock} onChange={(e) => set("tagline", e.target.value)} />
            </Field>
            <Field label="Destaque visual" htmlFor="pl-hl">
              <NativeSelect id="pl-hl" value={form.highlight} disabled={lock} onChange={(e) => set("highlight", e.target.value)}>
                <option value="">Sem destaque</option>
                <option value="popular">Destaque (azul)</option>
                <option value="value">Destaque (verde)</option>
              </NativeSelect>
            </Field>
            <Field label="Texto do botão" htmlFor="pl-cta" hint={isCustom ? "Padrão: Entre em contato." : "Padrão: Assinar / Começar teste grátis."}>
              <Input id="pl-cta" value={form.ctaLabel} maxLength={40} disabled={lock} onChange={(e) => set("ctaLabel", e.target.value)} />
            </Field>
            <Field label="Ordem de exibição no site" htmlFor="pl-sort" hint="Menor aparece primeiro.">
              <Input id="pl-sort" inputMode="numeric" value={form.sortOrder} required disabled={lock} onChange={(e) => set("sortOrder", e.target.value)} />
            </Field>
            {isCustom && (
              <div className="sm:col-span-2">
                <Field label="Destino do botão de contato" htmlFor="pl-contact" hint="https://… (ex.: https://wa.me/55…), mailto:… ou um caminho interno (/contato). Sem destino, o botão fica desabilitado — o plano personalizado nunca inicia cobrança.">
                  <Input id="pl-contact" value={form.contactUrl} maxLength={500} disabled={lock} onChange={(e) => set("contactUrl", e.target.value)} placeholder="https://wa.me/5511999999999" />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <Check id="pl-active" checked={form.status === "active"} disabled={lock || (plan?.is_protected ?? false)} onChange={(v) => set("status", v ? "active" : "inactive")} label="Plano ativo (pode ser contratado)" hint={plan?.is_protected ? "Planos do sistema não podem ser desativados." : "Plano inativo não pode ser contratado nem por chamada direta ao checkout."} />
              <Check id="pl-visible" checked={form.publicVisible} disabled={lock} onChange={(v) => set("publicVisible", v)} label="Exibir no site e na tela de planos" hint="Oculto = não aparece nas listas, mas continua ativo para quem já o usa." />
            </div>
          </CardContent>
        </Card>

        {!isLifetime && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preço, duração e promoção</CardTitle>
              <CardDescription>
                O preço atual é o valor cobrado. Mudar o preço vale para NOVAS cobranças: cobranças já criadas e assinaturas existentes não são alteradas.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label={isCustom ? "Preço atual (sob consulta)" : "Preço atual (R$) *"} htmlFor="pl-price" hint={isCustom ? "O plano personalizado não tem preço." : isTrial ? undefined : "Mínimo de R$ 1,00 (limite do provedor de pagamento)."}>
                <Input id="pl-price" inputMode="decimal" value={form.price} required={!isCustom} disabled={lock || isCustom} onChange={(e) => set("price", e.target.value)} placeholder="65,00" />
              </Field>
              <Field label={isCustom ? "Duração (negociável)" : "Duração do acesso (dias) *"} htmlFor="pl-days" hint={plan?.kind === "standard" ? "Durações comerciais atuais: 31, 93 e 365 dias." : undefined}>
                <Input id="pl-days" inputMode="numeric" value={form.accessDurationDays} required={!isCustom} disabled={lock || isCustom} onChange={(e) => set("accessDurationDays", e.target.value)} />
              </Field>
              {!isCustom && !isTrial && (
                <>
                  <Field label="Preço anterior / de referência (R$)" htmlFor="pl-compare" hint="Opcional. Precisa ser maior que o preço atual.">
                    <Input id="pl-compare" inputMode="decimal" value={form.comparePrice} disabled={lock} onChange={(e) => set("comparePrice", e.target.value)} placeholder="89,90" />
                  </Field>
                  <Field label="Desconto calculado" hint="Calculado pelo sistema (centavos exatos), não digitado.">
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums">
                      {pct !== null ? `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}% (economia de R$ ${savingsAmount(parseMoney(form.price), parseMoney(form.comparePrice))!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})` : "—"}
                    </div>
                  </Field>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                    <Check id="pl-promo" checked={form.promoEnabled} disabled={lock} onChange={(v) => set("promoEnabled", v)} label="Promoção ativa" hint="Só exibe o desconto dentro da janela abaixo." />
                    <Check id="pl-showcmp" checked={form.showComparePrice} disabled={lock} onChange={(v) => set("showComparePrice", v)} label="Mostrar preço anterior riscado" />
                    <Check id="pl-showpct" checked={form.showDiscountPercent} disabled={lock} onChange={(v) => set("showDiscountPercent", v)} label="Mostrar percentual de desconto" />
                  </div>
                  <Field label="Início da promoção (Brasília)" htmlFor="pl-ps">
                    <Input id="pl-ps" type="datetime-local" value={form.promoStartsAt} disabled={lock} onChange={(e) => set("promoStartsAt", e.target.value)} />
                  </Field>
                  <Field label="Término da promoção (Brasília)" htmlFor="pl-pe" hint="Depois do término o desconto some do site; o preço cobrado NÃO volta sozinho ao anterior — ajuste o preço se quiser.">
                    <Input id="pl-pe" type="datetime-local" value={form.promoEndsAt} disabled={lock} onChange={(e) => set("promoEndsAt", e.target.value)} />
                  </Field>
                  {plan && (
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Estado da promoção hoje: <strong>{{ none: "sem promoção", scheduled: "agendada", active: "em vigor", expired: "encerrada" }[plan.promo_state]}</strong>.
                    </p>
                  )}
                </>
              )}
              <Field label="Intervalo de cobrança (informativo)" htmlFor="pl-bi">
                <NativeSelect id="pl-bi" value={form.billingInterval} disabled={lock || isCustom} onChange={(e) => set("billingInterval", e.target.value)}>
                  <option value="">Não informado</option>
                  <option value="month">Mensal</option>
                  <option value="year">Anual</option>
                </NativeSelect>
              </Field>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limites e recursos reais</CardTitle>
            <CardDescription>
              Estes campos SÃO aplicados pelo sistema (vagas de usuário e suporte). Texto de benefício não concede nada — só estes campos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Usuários adicionais (além do proprietário) *" htmlFor="pl-users" hint="Total de pessoas = proprietário + este número. A inclusão acima do limite é recusada pelo banco.">
              <Input id="pl-users" inputMode="numeric" value={form.additionalUserLimit} required disabled={lock} onChange={(e) => set("additionalUserLimit", e.target.value)} />
            </Field>
            <div className="grid content-start gap-3">
              <Check id="pl-support" checked={form.supportEnabled} disabled={lock} onChange={(v) => set("supportEnabled", v)} label="Suporte por e-mail" />
              <Check id="pl-trial" checked={form.trial} disabled={lock || (plan ? plan.subscriptions_count > 0 || plan.payments_count > 0 : false)} onChange={(v) => set("trial", v)} label="Plano de teste grátis" hint={plan && (plan.subscriptions_count > 0 || plan.payments_count > 0) ? "Não pode ser alterado: o plano já foi utilizado." : undefined} />
              <Check id="pl-tickets" checked={form.ticketsEnabled} disabled={lock} onChange={(v) => set("ticketsEnabled", v)} label="Tickets (flag)" hint="Ainda sem funcionalidade no produto: não é anunciado no site." />
              <Check id="pl-groups" checked={form.exclusiveGroupsEnabled} disabled={lock} onChange={(v) => set("exclusiveGroupsEnabled", v)} label="Grupos exclusivos (flag)" />
              <Check id="pl-early" checked={form.earlyAccessEnabled} disabled={lock} onChange={(v) => set("earlyAccessEnabled", v)} label="Acesso antecipado (flag)" />
            </div>
            {plan && !readOnly && activeSubscriptions > 0 && (
              <div className="sm:col-span-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <Check
                  id="pl-apply"
                  checked={form.applyLimitsToExisting}
                  disabled={lock}
                  onChange={(v) => set("applyLimitsToExisting", v)}
                  label={`Aplicar limite e recursos às ${activeSubscriptions} assinatura(s) ativa(s) deste plano`}
                  hint="Padrão: desligado — assinaturas existentes mantêm o que contrataram. Ao reduzir o limite abaixo do uso atual, ninguém é removido: novas inclusões ficam bloqueadas até regularizar."
                />
              </div>
            )}
          </CardContent>
        </Card>

        {!isCustom || form.benefits.length > 0 || !readOnly ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Benefícios comerciais</CardTitle>
              <CardDescription>Textos mostrados no cartão do plano (até {BENEFIT_MAX}). Remover da lista arquiva — o histórico é preservado. Os recursos reais (usuários, suporte) aparecem sozinhos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Título do conjunto de benefícios" htmlFor="pl-bt" hint="Opcional. No plano personalizado é o título do bloco.">
                <Input id="pl-bt" value={form.benefitsTitle} maxLength={80} disabled={lock} onChange={(e) => set("benefitsTitle", e.target.value)} />
              </Field>
              {form.benefits.length === 0 && <p className="text-sm text-muted-foreground">Nenhum benefício cadastrado.</p>}
              {form.benefits.map((b, index) => (
                <div key={b.key} className="grid gap-2 rounded-md border border-border p-3">
                  <Input aria-label={`Benefício ${index + 1}`} value={b.text} maxLength={BENEFIT_TEXT_MAX} disabled={lock} placeholder="Ex.: Acesso às ferramentas da plataforma" onChange={(e) => setForm((f) => ({ ...f, benefits: f.benefits.map((x) => (x.key === b.key ? { ...x, text: e.target.value } : x)) }))} />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Check id={`b-hl-${b.key}`} checked={b.highlighted} disabled={lock} onChange={(v) => setForm((f) => ({ ...f, benefits: f.benefits.map((x) => (x.key === b.key ? { ...x, highlighted: v } : x)) }))} label="Destacar" />
                    <Check id={`b-vis-${b.key}`} checked={b.visible} disabled={lock} onChange={(v) => setForm((f) => ({ ...f, benefits: f.benefits.map((x) => (x.key === b.key ? { ...x, visible: v } : x)) }))} label="Exibir" />
                    <Check id={`b-inc-${b.key}`} checked={b.included} disabled={lock} onChange={(v) => setForm((f) => ({ ...f, benefits: f.benefits.map((x) => (x.key === b.key ? { ...x, included: v } : x)) }))} label="Incluído (desmarque para “não incluído”)" />
                    {!readOnly && (
                      <span className="ml-auto flex items-center gap-1">
                        <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={lock || index === 0} onClick={() => moveBenefit(index, -1)}><ArrowUp className="size-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={lock || index === form.benefits.length - 1} onClick={() => moveBenefit(index, 1)}><ArrowDown className="size-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Remover da apresentação" disabled={lock} onClick={() => setForm((f) => ({ ...f, benefits: f.benefits.filter((x) => x.key !== b.key) }))}><Trash2 className="size-4" /></Button>
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!readOnly && (
                <div>
                  <Button type="button" variant="outline" size="sm" disabled={lock || form.benefits.length >= BENEFIT_MAX} onClick={() => setForm((f) => ({ ...f, benefits: [...f.benefits, { key: newKey(), text: "", highlighted: false, visible: true, included: true }] }))}>
                    <Plus className="mr-1 size-4" /> Adicionar benefício
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : plan ? "Salvar alterações" : "Criar plano"}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push("/admin/plans")}>Cancelar</Button>
          </div>
        )}
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Como aparece no site</p>
        <PricingCard plan={preview} preview />
        <p className="mt-2 text-xs text-muted-foreground">Pré-visualização do que você digitou. O site mostra o que estiver salvo e dentro da janela da promoção.</p>
      </aside>
    </form>
  );
}
