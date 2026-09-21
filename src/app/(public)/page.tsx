import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SectionHeading } from "@/components/marketing/section-heading";
import { PricingCard } from "@/components/marketing/pricing-card";
import { AnimatedHeroVisual } from "@/components/marketing/animated-hero-visual";
import { Reveal, ScrollProgress } from "@/components/marketing/motion";
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
  "Gerencie clientes, produtos, serviços, vendas, fidelidade e caixa em um só lugar com o Prime Ges.";

export const metadata: Metadata = {
  title: "Prime Ges — Gestão simples, moderna e organizada",
  description: SEO_DESCRIPTION,
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    title: "Prime Ges — Gestão simples, moderna e organizada",
    description: SEO_DESCRIPTION,
    url: siteConfig.url,
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
  },
};

const HERO_POINTS = [
  "Clientes, produtos, serviços, vendas, fidelidade e caixa centralizados",
  "Acesso rápido de qualquer lugar",
  "Interface feita para trabalhar, não para complicar",
];

const DEMO_BARS = [35, 55, 42, 76, 62, 88];

export default function HomePage() {
  return (
    <>
      <ScrollProgress />
      <SiteHeader />

      <main>
        <section id="topo" className="prime-hero relative overflow-hidden">
          <div className="prime-hero-grid" aria-hidden="true" />
          <div className="prime-hero-sheen" aria-hidden="true" />

          <div className="container relative z-10 grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:gap-8 lg:py-24 xl:py-28">
            <div>
              <Reveal>
                <div className="prime-eyebrow">
                  <span className="prime-eyebrow-dot" />
                  Gestão SaaS para pequenas empresas
                  <Sparkles size={13} />
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl xl:text-[4.45rem]">
                  Sua empresa mais organizada.
                  <span className="prime-gradient-text block">Seu dia mais leve.</span>
                </h1>
              </Reveal>

              <Reveal delay={150}>
                <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Clientes, produtos, serviços, vendas, fidelidade e caixa reunidos em uma experiência moderna para você administrar melhor o negócio — sem perder tempo procurando informação.
                </p>
              </Reveal>

              <Reveal delay={220}>
                <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Link
                    href={siteConfig.links.register}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "prime-button-primary h-12 gap-2 px-7",
                    )}
                  >
                    Começar agora
                    <ArrowRight size={17} />
                  </Link>
                  <a
                    href="#recursos"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "prime-button-outline h-12 gap-2 px-7",
                    )}
                  >
                    Conhecer o Prime Ges
                    <ChevronDown size={16} />
                  </a>
                </div>
              </Reveal>

              <Reveal delay={290}>
                <div className="mt-8 flex flex-col gap-3">
                  {HERO_POINTS.map((item) => (
                    <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <span className="prime-check">
                        <Check size={12} />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={350}>
                <div className="mt-9 flex flex-wrap gap-2 text-xs text-muted-foreground/70">
                  {["Sem complicação", "Na nuvem", "Dados organizados", "Acesso rápido"].map((item) => (
                    <span key={item} className="prime-trust-chip">
                      {item}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            <Reveal delay={120} distance={28} duration={780}>
              <AnimatedHeroVisual />
            </Reveal>
          </div>

          <a href="#beneficios" className="prime-scroll-cue" aria-label="Ir para benefícios">
            <span>Explore</span>
            <ChevronDown size={15} />
          </a>
        </section>

        <section className="prime-trust-strip">
          <div className="container flex flex-col gap-5 py-6 lg:flex-row lg:items-center lg:justify-between">
            <Reveal>
              <p className="text-sm text-muted-foreground">
                Tudo o que você precisa para ter mais clareza na operação.
              </p>
            </Reveal>

            <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
              {TRUST_ITEMS.map((item, index) => (
                <Reveal key={item.label} delay={index * 60}>
                  <div className="flex items-center gap-2 text-sm text-foreground/90">
                    <Check size={15} className="text-success" />
                    {item.label}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="beneficios" className="prime-section container py-20 sm:py-24 lg:py-28">
          <Reveal>
            <SectionHeading
              eyebrow="Benefícios"
              title="Uma interface que trabalha no ritmo do seu negócio."
              description="Menos cliques para chegar ao que importa. Mais clareza para decidir e executar."
            />
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((benefit, index) => (
              <Reveal key={benefit.title} delay={index * 80}>
                <article className="prime-feature-card h-full">
                  <span className="prime-icon-tile">
                    <benefit.icon size={20} />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-foreground">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{benefit.description}</p>
                  <span className="prime-card-arrow">
                    <ArrowRight size={15} />
                  </span>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="segmentos" className="prime-surface-section py-20 sm:py-24 lg:py-28">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Para quem é"
                title="Feito para quem precisa de gestão sem enrolação."
                description="Uma base flexível para pequenos negócios de comércio e serviços, com espaço para crescer."
              />
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SEGMENTS.map((segment, index) => (
                <Reveal key={segment.name} delay={index * 70}>
                  <article className="prime-segment-card">
                    <span className="prime-icon-tile prime-icon-tile--soft">
                      <segment.icon size={20} />
                    </span>
                    <h3 className="mt-5 text-base font-semibold text-foreground">{segment.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{segment.description}</p>
                    <span className="prime-card-arrow">
                      <ArrowRight size={15} />
                    </span>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="prime-section container py-20 sm:py-24 lg:py-28">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <div>
                <SectionHeading
                  align="left"
                  eyebrow="Antes e depois"
                  title="Menos planilhas. Menos confusão. Mais controle."
                  description="Quando as informações ficam espalhadas, o dia vira uma sequência de buscas. O Prime Ges transforma isso em uma rotina centralizada."
                />
                <ul className="mt-8 flex flex-col gap-3">
                  {PROBLEMS.map((problem) => (
                    <li key={problem.title} className="prime-problem-item">
                      <span className="prime-problem-dot" />
                      {problem.title}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="prime-solution-card">
                <div className="prime-solution-glow" aria-hidden="true" />
                <div className="relative">
                  <p className="text-sm font-semibold text-foreground">Com o Prime Ges</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    Você enxerga a operação sem trocar de ferramenta.
                  </p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {SOLUTION_ITEMS.map((item) => (
                      <div key={item} className="prime-solution-item">
                        <span><Check size={13} /></span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="recursos" className="prime-surface-section py-20 sm:py-24 lg:py-28">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Recursos"
                title="Tudo em uma experiência que faz sentido."
                description="Veja os módulos já disponíveis e acompanhe a evolução da plataforma em um só lugar."
              />
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <Reveal key={feature.name} delay={index * 65}>
                  <article className={cn("prime-resource-card", !feature.available && "prime-resource-card--muted")}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn("prime-icon-tile", !feature.available && "prime-icon-tile--muted")}>
                        <feature.icon size={20} />
                      </span>
                      {!feature.available && <span className="prime-coming-soon">Em breve</span>}
                    </div>
                    <h3 className="mt-5 text-base font-semibold text-foreground">{feature.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="prime-section container py-20 sm:py-24 lg:py-28">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-center">
            <Reveal>
              <SectionHeading
                align="left"
                eyebrow="Demonstração"
                title="Uma ideia clara de como a gestão se organiza."
                description="Informação importante primeiro, ações rápidas depois — a linguagem visual do produto em três cenas."
              />
            </Reveal>

            <div className="grid gap-5 sm:grid-cols-3">
              {DEMO_SCREENS.map((screen, index) => (
                <Reveal key={screen.title} delay={index * 90}>
                  <div className="prime-demo-card">
                    <DemoMock variant={screen.variant} />
                    <h3 className="mt-4 text-sm font-semibold text-foreground">{screen.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{screen.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="prime-surface-section py-20 sm:py-24 lg:py-28">
          <div className="container">
            <Reveal>
              <SectionHeading
                title="Comece em poucos minutos."
                description="Um caminho curto da conta criada até a empresa organizada."
              />
            </Reveal>

            <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <Reveal key={step.number} delay={index * 100}>
                  <div className="prime-step-card">
                    <span className="prime-step-number">{step.number}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Configure o essencial e comece a trabalhar.
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="precos" className="prime-section container py-20 sm:py-24 lg:py-28">
          <Reveal>
            <SectionHeading
              eyebrow="Preços"
              title="Comece simples. Cresça quando precisar."
              description="Planos claros para começar sem surpresa e evoluir conforme sua empresa cresce."
            />
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_PLANS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 80}>
                <PricingCard plan={plan} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={160}>
            <div className="prime-comparison-wrap mt-10 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-white/[.025] text-left text-[11px] uppercase tracking-[.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3.5 font-medium">Recursos</th>
                    {PRICING_PLANS.map((plan) => (
                      <th key={plan.id} className="px-4 py-3.5 text-center font-medium">{plan.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.label} className="transition-colors hover:bg-white/[.02]">
                      <td className="px-4 py-3.5 text-foreground">
                        {row.label}
                        {row.note && <span className="mt-0.5 block text-xs text-muted-foreground">{row.note}</span>}
                      </td>
                      {row.values.map((value, index) => (
                        <td key={index} className="px-4 py-3.5 text-center">
                          {typeof value === "boolean" ? (
                            value ? (
                              <Check className="mx-auto h-4 w-4 text-success" />
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
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
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-border/80 bg-card/50 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="prime-trust-chip">{CUSTOM_PLAN.tagline}</span>
                <p className="mt-3 text-base font-semibold text-foreground">{CUSTOM_PLAN.title}</p>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{CUSTOM_PLAN.description}</p>
              </div>
              <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline" }), "shrink-0 cursor-not-allowed opacity-50")}>
                {CUSTOM_PLAN.ctaLabel}
              </span>
            </div>
          </Reveal>
        </section>

        <section className="prime-cta-section border-t border-border/80">
          <div className="container relative flex flex-col items-center gap-6 py-20 text-center sm:py-24 lg:py-28">
            <div className="prime-cta-glow" aria-hidden="true" />
            <Reveal>
              <div className="relative">
                <span className="prime-eyebrow">Pronto para organizar melhor?</span>
                <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-.03em] text-foreground sm:text-5xl">
                  Seu próximo passo pode ser mais simples.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Comece no Prime Ges e coloque clientes, produtos, vendas e operação para trabalhar no mesmo ritmo.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "lg" }), "prime-button-primary h-12 gap-2 px-8")}>
                    Começar agora
                    <ArrowRight size={17} />
                  </Link>
                  <Link href={siteConfig.links.login} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "prime-button-outline h-12 px-8")}>
                    Entrar
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function DemoMock({ variant }: { variant: "dashboard" | "clientes" | "gestao" }) {
  if (variant === "clientes") {
    return (
      <div className="prime-demo-mock">
        <div className="prime-demo-title" />
        <div className="prime-demo-lines"><i /><i /><i /><i /></div>
        <div className="prime-demo-row"><span /><b /><em /></div>
      </div>
    );
  }

  if (variant === "gestao") {
    return (
      <div className="prime-demo-mock">
        <div className="prime-demo-title" />
        <div className="prime-demo-grid"><i /><i /><i /><i /></div>
        <div className="prime-demo-chart-line" />
      </div>
    );
  }

  return (
    <div className="prime-demo-mock">
      <div className="prime-demo-title" />
      <div className="prime-demo-grid prime-demo-grid--stats"><i /><i /><i /><i /></div>
      <div className="prime-demo-bars">
        {DEMO_BARS.map((height, index) => <i key={index} style={{ height: height + "%" }} />)}
      </div>
    </div>
  );
}
