import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PricingCard } from "@/components/marketing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal, ScrollProgress } from "@/components/marketing/motion";
import {
  BENTO_CELLS,
  CREDIBILITY_ITEMS,
  CUSTOM_PLAN,
  DIFFERENTIALS,
  FEATURES,
  HOW_IT_WORKS_STEPS,
  PRICING_PLANS,
  PROBLEMS,
  SEGMENTS,
  buildFaq,
} from "@/config/marketing";
import { HomeHeroMockup, HomeProductShowcase } from "@/components/marketing/home-product-showcase";

const SEO_DESCRIPTION =
  "Gerencie clientes, produtos, serviços, vendas, fidelidade, caixa, estoque e financeiro em um só lugar com o Prime Ges.";

export const metadata: Metadata = {
  title: "Prime Ges — Gestão simples, moderna e organizada",
  description: SEO_DESCRIPTION,
  alternates: { canonical: siteConfig.url },
  openGraph: {
    title: "Prime Ges — Gestão simples, moderna e organizada",
    description: SEO_DESCRIPTION,
    url: siteConfig.url,
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
  },
};

const SEGMENT_MODULES: Record<string, string[]> = {
  Padarias: ["Produtos", "Vendas", "Clientes", "Caixa"],
  Mercadinhos: ["Produtos", "Vendas", "Clientes", "Caixa"],
  Restaurantes: ["Clientes", "Vendas", "Produtos", "Caixa"],
  Lanchonetes: ["Clientes", "Vendas", "Produtos", "Caixa"],
  "Lava-rápidos": ["Clientes", "Serviços", "Vendas", "Caixa"],
  "Estética automotiva": ["Clientes", "Serviços", "Fidelidade", "Caixa"],
};

const FEATURE_NAMES = new Set(FEATURES.filter((feature) => feature.available).map((feature) => feature.name));
const SECTION = "py-16 sm:py-24";
const iconTile = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary";

function enter(delayMs: number): CSSProperties {
  return { "--enter-delay": delayMs + "ms" } as CSSProperties;
}

export default function HomePage() {
  const trial = PRICING_PLANS.find((plan) => plan.id === "FREE_TRIAL");
  const faq = buildFaq(PRICING_PLANS);

  return (
    <>
      <ScrollProgress />
      <SiteHeader />

      <main id="conteudo" tabIndex={-1} className="outline-none">
        {/* HERO — o que é, para quem, que problema resolve e qual a ação */}
        <section id="topo" className="home-v2-hero" aria-labelledby="hero-title">
          <div className="home-v2-hero__grid" aria-hidden="true" />
          <div className="home-v2-hero__orb home-v2-hero__orb--one" aria-hidden="true" />
          <div className="home-v2-hero__orb home-v2-hero__orb--two" aria-hidden="true" />

          <div className="container relative z-10">
            <div className="home-v2-hero__layout">
              <div className="home-v2-hero__copy">
                <span className="home-v2-kicker prime-enter" style={enter(0)}>
                  <i />
                  Gestão para pequenos negócios
                  <Sparkles size={13} aria-hidden="true" />
                </span>

                <h1 id="hero-title" className="prime-enter" style={enter(70)}>
                  Seu negócio organizado,
                  <span>da venda ao caixa, em um só sistema.</span>
                </h1>

                <p className="prime-enter" style={enter(140)}>
                  O Prime Ges reúne clientes, produtos, serviços, vendas, fidelidade, caixa, estoque e financeiro
                  em uma plataforma online feita para a rotina de pequenos negócios.
                </p>

                <div className="home-v2-hero__actions prime-enter" style={enter(210)}>
                  <Link
                    href={siteConfig.links.register}
                    className={cn(buttonVariants({ size: "lg" }), "home-v2-primary-btn prime-cta")}
                  >
                    Criar conta
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <a
                    href="#produto"
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "home-v2-secondary-btn")}
                  >
                    Ver como funciona
                  </a>
                </div>

                <ul className="home-v2-hero__trust prime-enter" style={enter(280)}>
                  {trial && (
                    <li>
                      <Check size={13} aria-hidden="true" /> Teste grátis de {trial.periodLabel}
                    </li>
                  )}
                  <li>
                    <Check size={13} aria-hidden="true" /> Pagamento por Pix
                  </li>
                  <li>
                    <Check size={13} aria-hidden="true" /> Sem instalar nada
                  </li>
                </ul>
              </div>

              <div className="prime-enter" style={enter(180)}>
                <HomeHeroMockup />
              </div>
            </div>
          </div>
        </section>

        {/* CREDIBILIDADE REAL — só fatos verificáveis do produto */}
        <section aria-labelledby="credibilidade-title" className="border-y border-border bg-card/30 py-10">
          <div className="container">
            <h2 id="credibilidade-title" className="sr-only">
              Como o Prime Ges funciona por baixo
            </h2>
            <Reveal>
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                {CREDIBILITY_ITEMS.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className={iconTile}>
                      <item.icon size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* PROBLEMA */}
        <section id="problema" className={SECTION} aria-labelledby="problema-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="O problema"
                title={<span id="problema-title">Administrar sem um lugar único toma tempo e esconde o que importa.</span>}
                description="Quando cada informação mora num lugar, o dia a dia vira busca, retrabalho e decisão no escuro."
              />
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PROBLEMS.map((problem, index) => (
                <Reveal key={problem.title} delay={index * 60}>
                  <Card className="h-full p-6">
                    <span className={iconTile}>
                      <problem.icon size={18} aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{problem.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{problem.description}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* SOLUÇÃO — bento com os módulos reais */}
        <section id="recursos" className={cn(SECTION, "border-y border-border bg-card/30")} aria-labelledby="solucao-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="A solução"
                title={<span id="solucao-title">Tudo o que você usa todo dia, no mesmo lugar.</span>}
                description="Oito módulos já disponíveis, organizados pela rotina do negócio."
              />
            </Reveal>
            <div className="mt-10 grid gap-4 lg:grid-cols-6">
              {BENTO_CELLS.map((cell, index) => (
                <Reveal key={cell.id} delay={index * 60} className={cell.size === "lg" ? "lg:col-span-4" : "lg:col-span-2"}>
                  <Card className="prime-card h-full p-6">
                    <span className={iconTile}>
                      <cell.icon size={18} aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-foreground">{cell.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{cell.description}</p>
                    <ul className="mt-4 flex flex-wrap gap-2" aria-label={"Módulos de " + cell.title}>
                      {cell.modules
                        .filter((name) => FEATURE_NAMES.has(name))
                        .map((name) => (
                          <li key={name}>
                            <Badge variant="muted">{name}</Badge>
                          </li>
                        ))}
                    </ul>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FUNCIONALIDADES — prévia ilustrativa (dados demonstrativos, identificados como tal) */}
        <section id="produto" className={SECTION} aria-labelledby="produto-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Veja por dentro"
                title={<span id="produto-title">Uma interface simples para cada parte da rotina.</span>}
                description="Prévia ilustrativa dos módulos. Os dados exibidos nas telas abaixo são demonstrativos."
              />
            </Reveal>
            <Reveal delay={80} className="mt-10">
              <HomeProductShowcase />
            </Reveal>
          </div>
        </section>

        {/* PARA QUEM É */}
        <section id="segmentos" className={cn(SECTION, "border-y border-border bg-card/30")} aria-labelledby="segmentos-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Para quem é"
                title={<span id="segmentos-title">O sistema acompanha o jeito que o seu negócio funciona.</span>}
                description="Diferentes operações usam a mesma base e escolhem os módulos que fazem sentido para a rotina."
              />
            </Reveal>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SEGMENTS.map((segment, index) => (
                <li key={segment.name}>
                  <Reveal delay={index * 45} className="h-full">
                    <Card className="prime-card h-full p-6">
                      <div className="flex items-center gap-3">
                        <span className={iconTile}>
                          <segment.icon size={18} aria-hidden="true" />
                        </span>
                        <h3 className="text-base font-semibold text-foreground">{segment.name}</h3>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{segment.description}</p>
                      <ul className="mt-4 flex flex-wrap gap-2" aria-label={"Módulos para " + segment.name}>
                        {(SEGMENT_MODULES[segment.name] ?? []).map((module) => (
                          <li key={module}>
                            <Badge variant="muted">{module}</Badge>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section id="como-funciona" className={SECTION} aria-labelledby="como-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Como funciona"
                title={<span id="como-title">Da conta criada à rotina organizada em três passos.</span>}
                description="Sem fluxo complicado: você entra, configura o essencial e começa a administrar."
              />
            </Reveal>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step.number}>
                  <Reveal delay={index * 70} className="h-full">
                    <Card className="h-full p-6">
                      <span className="text-sm font-semibold text-primary" aria-hidden="true">
                        {step.number}
                      </span>
                      <h3 className="mt-2 text-lg font-semibold text-foreground">
                        <span className="sr-only">Passo {index + 1}: </span>
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                    </Card>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* DIFERENCIAIS REAIS */}
        <section id="diferenciais" className={cn(SECTION, "border-y border-border bg-card/30")} aria-labelledby="dif-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Diferenciais"
                title={<span id="dif-title">O que torna o Prime Ges diferente na prática.</span>}
              />
            </Reveal>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {DIFFERENTIALS.map((item, index) => (
                <li key={item.title}>
                  <Reveal delay={index * 60} className="h-full">
                    <Card className="prime-card flex h-full gap-4 p-6">
                      <span className={iconTile}>
                        <item.icon size={18} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      </div>
                    </Card>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* PLANOS — mesma fonte única (PRICING_PLANS) e o mesmo PricingCard */}
        <section id="precos" className={SECTION} aria-labelledby="precos-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Planos"
                title={<span id="precos-title">Escolha o período que faz sentido para o seu negócio.</span>}
                description="Comece com o teste e avance para o plano que acompanha a sua operação."
              />
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PRICING_PLANS.map((plan, index) => (
                <Reveal key={plan.id} delay={index * 55} className="h-full [&>div]:h-full">
                  <PricingCard plan={plan} />
                </Reveal>
              ))}
            </div>

            <Reveal delay={120} className="mt-6">
              <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Badge variant="muted">{CUSTOM_PLAN.tagline}</Badge>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{CUSTOM_PLAN.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{CUSTOM_PLAN.description}</p>
                </div>
                <p className="text-sm text-muted-foreground sm:max-w-[16rem]">
                  O canal comercial para este plano ainda não está disponível.
                </p>
              </Card>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={cn(SECTION, "border-t border-border bg-card/30")} aria-labelledby="faq-title">
          <div className="container">
            <Reveal>
              <SectionHeading
                eyebrow="Perguntas frequentes"
                title={<span id="faq-title">O que você precisa saber antes de começar.</span>}
              />
            </Reveal>
            <Reveal delay={80} className="mx-auto mt-10 max-w-3xl">
              <Accordion type="single" collapsible className="w-full">
                {faq.map((item, index) => (
                  <AccordionItem key={item.question} value={"faq-" + index}>
                    <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
                    <AccordionContent className="text-sm leading-6 text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="home-v2-final" aria-labelledby="cta-title">
          <div className="home-v2-final__glow home-v2-final__glow--one" aria-hidden="true" />
          <div className="home-v2-final__glow home-v2-final__glow--two" aria-hidden="true" />
          <div className="container relative">
            <Reveal>
              <div className="home-v2-final__inner">
                <span className="home-v2-final__badge">
                  <Sparkles size={13} aria-hidden="true" /> Prime Ges
                </span>
                <h2 id="cta-title">Comece a organizar o seu negócio hoje.</h2>
                <p>
                  Crie a conta, aceite os documentos e use o teste grátis
                  {trial ? " de " + trial.periodLabel : ""} para conhecer a plataforma.
                </p>
                <div className="home-v2-final__actions">
                  <Link
                    href={siteConfig.links.register}
                    className={cn(buttonVariants({ size: "lg" }), "home-v2-primary-btn prime-cta")}
                  >
                    Criar conta
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <Link
                    href={siteConfig.links.login}
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "home-v2-secondary-btn")}
                  >
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
