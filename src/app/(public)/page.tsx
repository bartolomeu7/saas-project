import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SectionHeading } from "@/components/marketing/section-heading";
import { ProductMockup } from "@/components/marketing/product-mockup";
import { PricingCard } from "@/components/marketing/pricing-card";
import {
  SEGMENTS,
  FEATURES,
  TRUST_ITEMS,
  PROBLEMS,
  SOLUTION_ITEMS,
  DEMO_SCREENS,
  HOW_IT_WORKS_STEPS,
  BENEFITS,
  PRICING_PLANS,
  COMPARISON_ROWS,
  CUSTOM_PLAN,
} from "@/config/marketing";

const SEO_DESCRIPTION =
  "Gerencie clientes, vendas, serviços, estoque e financeiro em um só lugar com o Prime Ges.";

export const metadata: Metadata = {
  title: "Prime Ges — Gestão simples para pequenas empresas",
  description: SEO_DESCRIPTION,
  openGraph: {
    title: "Prime Ges — Gestão simples para pequenas empresas",
    description: SEO_DESCRIPTION,
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
  },
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* HERO */}
        <section id="topo" className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,hsl(var(--primary)/0.16),transparent)]"
            aria-hidden="true"
          />
          <div className="container grid grid-cols-1 items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:py-28">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
                Gestão simples para pequenas empresas
              </span>
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
                Tenha sua empresa sob controle em um só lugar.
              </h1>
              <p className="max-w-lg text-balance text-base text-muted-foreground sm:text-lg">
                Clientes, vendas, serviços, estoque e financeiro organizados
                de forma simples para você administrar melhor o seu negócio.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={siteConfig.links.register}
                  className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                >
                  Começar agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#recursos"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  Conhecer o Prime Ges
                </a>
              </div>
            </div>

            <ProductMockup variant="dashboard" className="lg:pl-6" />
          </div>
        </section>

        {/* TRUST STRIP */}
        <section className="border-y border-border bg-card/40">
          <div className="container flex flex-col items-center gap-4 py-6 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Feito para quem quer administrar sem complicação.
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {TRUST_ITEMS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-1.5 text-sm text-foreground"
                >
                  <Check className="h-4 w-4 text-success" strokeWidth={2} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* BENEFÍCIOS */}
        <section className="container py-20 sm:py-24">
          <SectionHeading
            eyebrow="Benefícios"
            title="Feito para simplificar o seu dia a dia."
          />
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/30"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <benefit.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="mt-4 text-sm font-semibold text-foreground">
                  {benefit.title}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SEGMENTOS */}
        <section id="segmentos" className="border-t border-border bg-card/20 py-20 sm:py-24">
          <div className="container">
            <SectionHeading
              eyebrow="Para quem é"
              title="Feito para o seu tipo de negócio."
              description="Pequenos negócios de diversos segmentos já podem organizar a gestão com o Prime Ges."
            />
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SEGMENTS.map((segment) => (
                <div
                  key={segment.name}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
                    <segment.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-foreground">
                    {segment.name}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {segment.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROBLEMA -> SOLUÇÃO */}
        <section className="container py-20 sm:py-24">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading
                align="left"
                title="Menos planilhas. Menos confusão. Mais controle."
              />
              <ul className="mt-8 flex flex-col gap-4">
                {PROBLEMS.map((problem) => (
                  <li key={problem.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    </span>
                    <p className="text-sm text-foreground sm:text-base">
                      {problem.title}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
              <p className="text-sm font-semibold text-foreground sm:text-base">
                Com o Prime Ges, você centraliza sua gestão em um único lugar.
              </p>
              <ul className="mt-5 flex flex-col gap-3">
                {SOLUTION_ITEMS.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <p className="text-sm text-foreground">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FUNCIONALIDADES PRINCIPAIS */}
        <section id="recursos" className="border-t border-border bg-card/20 py-20 sm:py-24">
          <div className="container">
            <SectionHeading
              eyebrow="Recursos"
              title="Os principais módulos para gerir o seu negócio."
              description="Comece pelo que já está disponível — os demais módulos chegam nas próximas etapas."
            />
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.name}
                  className={cn(
                    "rounded-xl border p-5",
                    feature.available
                      ? "border-border bg-card"
                      : "border-border/60 bg-card/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        feature.available
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <feature.icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    {!feature.available && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Em breve
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-4 text-sm font-semibold",
                      feature.available ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {feature.name}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DEMONSTRAÇÃO */}
        <section className="container py-20 sm:py-24">
          <SectionHeading
            eyebrow="Demonstração"
            title="Veja como o Prime Ges funciona."
          />
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {DEMO_SCREENS.map((screen) => (
              <div key={screen.title} className="flex flex-col gap-4">
                <ProductMockup variant={screen.variant} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {screen.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {screen.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="border-t border-border bg-card/20 py-20 sm:py-24">
          <div className="container">
            <SectionHeading title="Comece em poucos minutos." />
            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((step) => (
                <div key={step.number} className="flex flex-col items-center gap-3 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {step.number}
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {step.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PREÇOS */}
        <section id="precos" className="container py-20 sm:py-24">
          <SectionHeading
            eyebrow="Preços"
            title="Escolha o plano ideal para o seu negócio."
            description="Comece gratuitamente ou escolha o plano que melhor atende sua empresa."
          />

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_PLANS.map((plan) => (
              <PricingCard key={plan.id} plan={plan} />
            ))}
          </div>

          {/* COMPARAÇÃO SIMPLES */}
          <div className="mt-12 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">&nbsp;</th>
                  {PRICING_PLANS.map((plan) => (
                    <th key={plan.id} className="px-4 py-3 text-center font-medium">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3 text-foreground">
                      {row.label}
                      {row.note && (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {row.note}
                        </span>
                      )}
                    </td>
                    {row.values.map((value, i) => (
                      <td key={i} className="px-4 py-3 text-center">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="mx-auto h-4 w-4 text-success" strokeWidth={2.25} />
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )
                        ) : (
                          <span className="text-foreground">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SOB MEDIDA */}
          <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-border bg-card/60 p-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <div>
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {CUSTOM_PLAN.tagline}
              </span>
              <p className="mt-2 text-base font-semibold text-foreground">
                {CUSTOM_PLAN.title}
              </p>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                {CUSTOM_PLAN.description}
              </p>
            </div>
            <span
              aria-disabled="true"
              title="Em breve"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full shrink-0 cursor-not-allowed opacity-50 sm:w-fit"
              )}
            >
              {CUSTOM_PLAN.ctaLabel}
            </span>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="border-t border-border bg-card/40">
          <div className="container flex flex-col items-center gap-6 py-20 text-center sm:py-24">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Pronto para ter sua empresa mais organizada?
            </h2>
            <p className="max-w-md text-sm text-muted-foreground sm:text-base">
              Comece a usar o Prime Ges e tenha sua gestão em um só lugar.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={siteConfig.links.register}
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                Começar agora
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={siteConfig.links.login}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Entrar
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
