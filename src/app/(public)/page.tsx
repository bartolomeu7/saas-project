import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PricingCard } from "@/components/marketing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal, ScrollProgress } from "@/components/marketing/motion";
import {
  BENTO_CELLS,
  CREDIBILITY_ITEMS,
  DIFFERENTIALS,
  FEATURES,
  HOW_IT_WORKS_STEPS,
  PROBLEMS,
  SEGMENTS,
  buildFaq,
} from "@/config/marketing";
import { HomeHeroMockup, HomeProductShowcase } from "@/components/marketing/home-product-showcase";
import { getPublicPlans } from "@/lib/billing/queries";
import { faqFacts, toPricingView } from "@/lib/billing/pricing-display";

const HOME_TITLE = "Prime Ges — Sistema de gestão online para pequenos negócios";
const SEO_DESCRIPTION =
  "Sistema de gestão online para MEI e pequenos negócios: organize vendas, caixa, estoque, clientes e financeiro em um só lugar, direto no navegador.";

// Os planos vêm do banco (get_public_plans): a página é estática e se renova sozinha a cada 60 s; salvar um plano no
// /admin também chama revalidatePath("/"). Se o catálogo não carregar, a seção mostra "indisponível" — nunca um preço
// inventado ou desatualizado.
export const revalidate = 60;

export const metadata: Metadata = {
  // `absolute`: o modelo "%s | Prime Ges" do layout raiz não se aplica à home (a marca já está no título).
  title: { absolute: HOME_TITLE },
  description: SEO_DESCRIPTION,
  alternates: { canonical: siteConfig.url },
  openGraph: publicOpenGraph("/", { title: HOME_TITLE, description: SEO_DESCRIPTION }),
};

const SEGMENT_MODULES: Record<string, string[]> = {
  Padarias: ["Produtos", "Estoque", "Vendas", "Caixa"],
  "Mercadinhos e mercearias": ["Produtos", "Estoque", "Vendas", "Caixa"],
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

export default async function HomePage() {
  const catalog = await getPublicPlans();
  const views = catalog.map(toPricingView);
  const gridPlans = views.filter((view) => view.kind !== "custom" && view.kind !== "lifetime");
  const customPlan = views.find((view) => view.kind === "custom") ?? null;
  const trialPlan = catalog.find((plan) => plan.kind === "trial");
  const trialLabel = trialPlan ? faqFacts(catalog).trialLabel : null;
  const faq = buildFaq(faqFacts(catalog));

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
                  Para MEI, microempresas e pequenos negócios
                  <Sparkles size={13} aria-hidden="true" />
                </span>

                <h1 id="hero-title" className="prime-enter" style={enter(70)}>
                  Sistema de gestão para pequenos negócios,
                  <span>da venda ao caixa, em um só lugar.</span>
                </h1>

                <p className="prime-enter" style={enter(140)}>
                  O Prime Ges é um sistema online que reúne clientes, produtos, serviços, vendas, fidelidade, caixa,
                  estoque e financeiro, feito para a rotina de lava-rápidos, estética automotiva, padarias, mercadinhos
                  e outros pequenos negócios.
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
                  <a
                    href="#precos"
                    className="inline-flex items-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ver planos e preços
                  </a>
                </div>

                <ul className="home-v2-hero__trust prime-enter" style={enter(280)}>
                  {trialLabel && (
                    <li>
                      <Check size={13} aria-hidden="true" /> Teste grátis de {trialLabel}
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
                title={<span id="solucao-title">Controle de vendas, caixa, estoque e financeiro no mesmo lugar.</span>}
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
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Quer saber quanto custa?{" "}
              <a href="#precos" className="font-medium text-foreground underline underline-offset-4">
                Consulte os planos
              </a>{" "}
              ou{" "}
              <Link href={siteConfig.links.register} className="font-medium text-foreground underline underline-offset-4">
                crie a sua conta
              </Link>{" "}
              e conheça o sistema.
            </p>
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
                title={<span id="segmentos-title">Sistema para pequenos negócios que vendem produtos, prestam serviços ou os dois.</span>}
                description="MEIs, microempresas e pequenos negócios usam a mesma base e escolhem os módulos que fazem sentido para a rotina."
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
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Veja o que cada módulo faz em{" "}
              <a href="#recursos" className="font-medium text-foreground underline underline-offset-4">
                recursos
              </a>{" "}
              e como começar em{" "}
              <a href="#como-funciona" className="font-medium text-foreground underline underline-offset-4">
                como funciona
              </a>
              .
            </p>
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

            {gridPlans.length > 0 ? (
              <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {gridPlans.map((plan, index) => (
                  <Reveal key={plan.id} delay={index * 55} className="h-full [&>div]:h-full">
                    <PricingCard plan={plan} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <Card className="mt-10 p-6 text-center text-sm text-muted-foreground">
                Os planos estão indisponíveis no momento. Tente novamente em instantes ou{" "}
                <Link href={siteConfig.links.register} className="font-medium text-foreground underline underline-offset-4">
                  crie a sua conta
                </Link>{" "}
                para conhecer a plataforma.
              </Card>
            )}

            <p className="mt-8 text-center text-sm text-muted-foreground">
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
                <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {customPlan.tagline && <Badge variant="muted">{customPlan.tagline}</Badge>}
                    <h3 className="mt-3 text-lg font-semibold text-foreground">{customPlan.benefitsTitle ?? customPlan.name}</h3>
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
                      <a
                        href={customPlan.ctaHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "outline" }), "sm:self-center")}
                      >
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
                </Card>
              </Reveal>
            )}
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
                    <AccordionContent forceMount className="text-sm leading-6 text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <p className="mt-6 text-center text-sm text-muted-foreground">
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
                  {trialLabel ? " de " + trialLabel : ""} para conhecer a plataforma.
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
