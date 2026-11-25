/** Blocos repetidos nas páginas do site público (componentes de servidor). */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingCard } from "@/components/marketing/pricing-card";
import { MarketingPhoto } from "@/components/marketing/photo";
import { ProductScreen } from "@/components/marketing/screens";
import { Reveal } from "@/components/marketing/motion";
import { FEATURES, MODULE_GROUPS, type FaqItem, type ScreenId } from "@/config/marketing";
import type { PhotoSlot } from "@/config/marketing-photos";
import type { PricingView } from "@/lib/billing/pricing-display";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

// Só módulos disponíveis (nunca um "em breve" apresentado como pronto).
const FEATURE_BY_NAME = new Map(FEATURES.filter((feature) => feature.available).map((feature) => [feature.name, feature]));

export function modulesByName(names: string[]) {
  return names.flatMap((name) => FEATURE_BY_NAME.get(name) ?? []);
}

export function Heading({ id, title, children, className }: { id?: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <Reveal className={cn("flex max-w-2xl flex-col gap-4", className)}>
      <h2 id={id} className="site-h2">
        {title}
      </h2>
      {children && <p className="site-lead">{children}</p>}
    </Reveal>
  );
}

export function PrimaryCta({ className }: { className?: string }) {
  return (
    <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "lg" }), "site-cta h-12 px-6 text-base", className)}>
      Criar conta
      <ArrowRight className="site-cta__arrow h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/** Topo das páginas internas: título, resumo e a foto (ou a tela do sistema) ao lado. */
export function PageHero({ title, lead, photo, screen }: { title: string; lead: string; photo: PhotoSlot; screen: ScreenId }) {
  return (
    <section className="site-section border-b border-border" aria-labelledby="pagina-titulo">
      <div className="container grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <div className="flex flex-col gap-6">
          <h1 id="pagina-titulo" className="site-h1">
            <span className="site-mask">
              <span>{title}</span>
            </span>
          </h1>
          <p className="site-lead prime-enter max-w-xl">{lead}</p>
          <div className="prime-enter flex flex-wrap items-center gap-4" style={{ animationDelay: "120ms" }}>
            <PrimaryCta />
            <Link href="/precos" className="site-link text-sm font-medium text-foreground">
              Ver planos e preços
            </Link>
          </div>
        </div>
        <div className="site-stage">
          <MarketingPhoto slot={photo} priority className="aspect-[4/3]" fallback={<ProductScreen id={screen} />} />
        </div>
      </div>
    </section>
  );
}

/** Abas por grupo de módulos. O conteúdo de todas as abas fica no HTML (forceMount + CSS). */
export function ModuleTabs() {
  return (
    <Tabs defaultValue={MODULE_GROUPS[0]!.id} className="mt-12">
      <TabsList aria-label="Grupos de módulos" className="site-tabs">
        {MODULE_GROUPS.map((group) => (
          <TabsTrigger key={group.id} value={group.id} className="site-tab">
            {group.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {MODULE_GROUPS.map((group) => (
        <TabsContent key={group.id} value={group.id} forceMount className="site-tabpanel mt-8">
          <p className="text-muted-foreground">{group.description}</p>
          <ul className="mt-6 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {modulesByName(group.modules).map((feature, index) => (
              <li key={feature.name} className="site-module site-pop" style={{ animationDelay: `${index * 50}ms` }}>
                <feature.icon className="site-module__icon h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-base font-semibold text-foreground">{feature.name}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Planos do catálogo do banco. Sem catálogo, a seção diz "indisponível" — nunca um preço inventado. */
export function PricingGrid({ views }: { views: PricingView[] }) {
  const gridPlans = views.filter((view) => view.kind !== "custom" && view.kind !== "lifetime");
  const customPlan = views.find((view) => view.kind === "custom") ?? null;

  return (
    <>
      {gridPlans.length > 0 ? (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {gridPlans.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 70} className="h-full [&>div]:h-full">
              <PricingCard plan={plan} />
            </Reveal>
          ))}
        </div>
      ) : (
        <p className="mt-12 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Os planos estão indisponíveis no momento. Tente novamente em instantes ou{" "}
          <Link href={siteConfig.links.register} className="font-medium text-foreground underline underline-offset-4">
            crie a sua conta
          </Link>{" "}
          para conhecer a plataforma.
        </p>
      )}

      <p className="mt-8 text-sm text-muted-foreground">
        Pagamento por Pix, sem renovação automática. Veja as regras de cancelamento e reembolso na{" "}
        <Link href="/politica-de-reembolso" className="font-medium text-foreground underline underline-offset-4">
          Política de Reembolso
        </Link>{" "}
        e as condições gerais nos{" "}
        <Link href="/termos-de-uso" className="font-medium text-foreground underline underline-offset-4">
          Termos de Uso
        </Link>
        .
      </p>

      {customPlan && (
        <Reveal delay={120} className="mt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {customPlan.tagline && <p className="text-sm text-muted-foreground">{customPlan.tagline}</p>}
              <h3 className="mt-1 text-lg font-semibold text-foreground">{customPlan.benefitsTitle ?? customPlan.name}</h3>
              {customPlan.description && <p className="mt-1 text-sm text-muted-foreground">{customPlan.description}</p>}
              {customPlan.lines.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {customPlan.lines.map((line, index) => (
                    <li key={`${index}-${line.text}`} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.25} aria-hidden="true" />
                      {line.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {customPlan.ctaHref ? (
              customPlan.ctaExternal ? (
                <a href={customPlan.ctaHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "sm:self-center")}>
                  {customPlan.ctaLabel}
                </a>
              ) : (
                <Link href={customPlan.ctaHref} className={cn(buttonVariants({ variant: "outline" }), "sm:self-center")}>
                  {customPlan.ctaLabel}
                </Link>
              )
            ) : (
              <p className="text-sm text-muted-foreground sm:max-w-[16rem]">O canal comercial para este plano ainda não está disponível.</p>
            )}
          </div>
        </Reveal>
      )}
    </>
  );
}

/** As respostas vão no HTML inicial (forceMount) e ficam escondidas por CSS quando fechadas. */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div>
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, index) => (
          <AccordionItem key={item.question} value={"faq-" + index}>
            <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
            <AccordionContent forceMount className="text-sm leading-6 text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="mt-6 text-sm text-muted-foreground">
        Documentos:{" "}
        <Link href="/termos-de-uso" className="font-medium text-foreground underline underline-offset-4">
          Termos de Uso
        </Link>
        ,{" "}
        <Link href="/politica-de-privacidade" className="font-medium text-foreground underline underline-offset-4">
          Política de Privacidade
        </Link>
        ,{" "}
        <Link href="/politica-de-reembolso" className="font-medium text-foreground underline underline-offset-4">
          Política de Reembolso
        </Link>{" "}
        e{" "}
        <Link href="/direitos-do-titular" className="font-medium text-foreground underline underline-offset-4">
          Direitos do Titular
        </Link>
        .
      </p>
    </div>
  );
}

export function FinalCta({ trialLabel }: { trialLabel: string | null }) {
  const facts = [trialLabel ? "Teste grátis de " + trialLabel : null, "Pagamento por Pix", "Sem renovação automática"].filter(
    (fact): fact is string => Boolean(fact),
  );
  return (
    <section className="site-section" aria-labelledby="cta-title">
      <div className="container">
        <Reveal>
          <div className="site-final">
            <div className="flex flex-col items-start gap-6 p-8 sm:p-14">
              <h2 id="cta-title" className="site-h2 text-white">
                Comece a organizar o seu negócio hoje.
              </h2>
              <p className="max-w-lg text-lg leading-8 text-white/90">
                Crie a conta, aceite os documentos e use o teste grátis{trialLabel ? " de " + trialLabel : ""} para conhecer a plataforma.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "lg" }), "site-cta h-12 bg-white px-6 text-base text-slate-900 hover:bg-white/90")}>
                  Criar conta
                  <ArrowRight className="site-cta__arrow h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href={siteConfig.links.login}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 border-white/60 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white")}
                >
                  Entrar
                </Link>
              </div>
              <ul className="site-final__trust">
                {facts.map((fact) => (
                  <li key={fact}>
                    <Check className="h-4 w-4" aria-hidden="true" /> {fact}
                  </li>
                ))}
              </ul>
            </div>
            <MarketingPhoto slot="sorriso" className="h-full min-h-[18rem] !rounded-none" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
