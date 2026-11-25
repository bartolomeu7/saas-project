import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { Reveal } from "@/components/marketing/motion";
import { MarketingPhoto } from "@/components/marketing/photo";
import { HeroLive } from "@/components/marketing/hero-live";
import { SaleFlow } from "@/components/marketing/sale-flow";
import { FaqList, FinalCta, Heading, ModuleTabs, PricingGrid, PrimaryCta, modulesByName } from "@/components/marketing/sections";
import { DIFFERENTIALS, FEATURES, HOW_IT_WORKS_STEPS, PROBLEMS, SEGMENTS, buildFaq } from "@/config/marketing";
import { getPublicPlans } from "@/lib/billing/queries";
import { DOUBTS, doubtPath } from "@/content/duvidas";
import { faqFacts, toPricingView } from "@/lib/billing/pricing-display";
import { JsonLd } from "@/components/seo/json-ld";
import { buildStructuredData } from "@/lib/seo/structured-data";

const HOME_TITLE = "Prime Ges — Sistema de gestão para pequenas empresas e MEI";
const SEO_DESCRIPTION =
  "Sistema de gestão online para pequenas empresas e MEI: organize vendas, caixa, estoque, clientes e financeiro em um só lugar, direto no navegador.";

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

const AVAILABLE_FEATURE_NAMES = FEATURES.filter((feature) => feature.available).map((feature) => feature.name);

// Dados estruturados (JSON-LD) só aqui: a home é a página de apresentação do produto. Sem `offers`,
// avaliações nem dados da empresa pendentes (ver src/lib/seo/structured-data.ts).
const STRUCTURED_DATA = buildStructuredData({
  origin: siteConfig.url,
  name: siteConfig.name,
  description: SEO_DESCRIPTION,
  logoPath: "/logo.png",
  logoSize: 512,
  featureNames: AVAILABLE_FEATURE_NAMES,
});

// Perguntas mais buscadas, com link direto da home.
const HOME_DOUBT_SLUGS = [
  "como-escolher-sistema-para-pequenas-empresas",
  "quanto-custa-um-sistema-para-pequenas-empresas",
  "sistema-gratuito-para-pequenas-empresas",
  "o-que-e-saas",
  "como-controlar-estoque",
  "como-controlar-o-fluxo-de-caixa",
];
const HOME_DOUBTS = HOME_DOUBT_SLUGS.flatMap((slug) => DOUBTS.find((doubt) => doubt.slug === slug) ?? []);

// Onde cada anotação "solta" começa antes de se juntar às outras (seção do problema).
const SCATTERED = [
  { x: "-34px", y: "-18px", r: "-5deg" },
  { x: "46px", y: "4px", r: "4deg" },
  { x: "-22px", y: "30px", r: "-3deg" },
];

function MoreLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="site-link mt-10 inline-flex min-h-11 items-center gap-2 text-base font-semibold text-foreground">
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export default async function HomePage() {
  const catalog = await getPublicPlans();
  const views = catalog.map(toPricingView);
  const trialPlan = catalog.find((plan) => plan.kind === "trial");
  const trialLabel = trialPlan ? faqFacts(catalog).trialLabel : null;
  const faq = buildFaq(faqFacts(catalog));
  const facts = [trialLabel ? "Teste grátis de " + trialLabel : null, "Pagamento por Pix", "Sem instalar nada"].filter(
    (fact): fact is string => Boolean(fact),
  );

  return (
    <MarketingShell>
      <JsonLd data={STRUCTURED_DATA} />

      {/* HERO — o que é, para quem, que problema resolve e qual a ação */}
      <section id="topo" className="site-hero" aria-labelledby="hero-title">
        <div className="container grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
          <div className="flex flex-col items-start gap-7">
            <p className="prime-enter text-sm font-semibold text-[hsl(var(--site-accent))]">Para MEI, microempresas e pequenos negócios</p>

            <h1 id="hero-title" className="site-h1">
              <span className="site-mask">
                <span>Sistema de gestão para pequenas empresas,</span>
              </span>
              {" "}
              <span className="site-mask text-[hsl(var(--site-accent))]">
                <span style={{ animationDelay: "160ms" }}>da venda ao caixa, em um só lugar.</span>
              </span>
            </h1>

            <p className="site-lead prime-enter max-w-xl" style={{ animationDelay: "260ms" }}>
              O Prime Ges reúne vendas, clientes, agenda, orçamentos, estoque, caixa e financeiro em um só lugar. Feito para a
              rotina de padarias, mercadinhos, lanchonetes, lava-rápidos e estética automotiva.
            </p>

            <div className="prime-enter flex flex-wrap items-center gap-3" style={{ animationDelay: "340ms" }}>
              <PrimaryCta />
              <a href="#produto" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-6 text-base")}>
                Ver como funciona
              </a>
              <a href="#precos" className="site-link inline-flex min-h-11 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                Ver planos e preços
              </a>
            </div>

            <ul className="prime-enter flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" style={{ animationDelay: "420ms" }}>
              {facts.map((fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          <div className="site-stage relative">
            <MarketingPhoto slot="balcao" priority className="aspect-[4/5] lg:aspect-[5/6]" />
            <div className="site-hero__panel">
              <HeroLive />
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEMA — as anotações espalhadas se juntam quando a seção entra na tela */}
      <section id="problema" className="site-section site-band" aria-labelledby="problema-title">
        <div className="container grid items-center gap-14 lg:grid-cols-2">
          <Heading id="problema-title" title="Administrar sem um lugar único toma tempo e esconde o que importa.">
            Quando cada informação mora num lugar, o dia a dia vira busca, retrabalho e decisão no escuro.
          </Heading>
          <Reveal>
            <ul className="flex flex-col gap-4">
              {PROBLEMS.map((problem, index) => (
                <li
                  key={problem.title}
                  className="site-note"
                  style={{ "--x": SCATTERED[index]!.x, "--y": SCATTERED[index]!.y, "--r": SCATTERED[index]!.r, transitionDelay: `${index * 110}ms` } as CSSProperties}
                >
                  <problem.icon className="h-6 w-6 shrink-0 text-[hsl(var(--site-accent))]" aria-hidden="true" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{problem.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{problem.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* PRODUTO — uma venda atravessando o sistema */}
      <section id="produto" className="site-section" aria-labelledby="produto-title">
        <div className="container">
          <Heading id="produto-title" title="Registre uma venda e o resto se atualiza.">
            Estoque, caixa, financeiro e fidelidade conversam entre si. As telas abaixo usam dados demonstrativos.
          </Heading>
          <div className="mt-14">
            <SaleFlow />
          </div>
          <MoreLink href="/produto">Conhecer o produto por dentro</MoreLink>
        </div>
      </section>

      {/* RECURSOS — todos os módulos, por rotina */}
      <section id="recursos" className="site-section site-band" aria-labelledby="solucao-title">
        <div className="container">
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]">
            <Heading id="solucao-title" title="Controle de vendas, caixa, estoque e financeiro no mesmo lugar.">
              {AVAILABLE_FEATURE_NAMES.length} módulos, organizados pela rotina do negócio.
            </Heading>
            <MarketingPhoto slot="tablet" className="hidden aspect-[3/2] lg:block" sizes="40vw" />
          </div>
          <ModuleTabs />
          <MoreLink href="/recursos">Ver o que cada módulo faz</MoreLink>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section id="segmentos" className="site-section" aria-labelledby="segmentos-title">
        <div className="container">
          <Heading id="segmentos-title" title="Sistema para pequenos negócios que vendem produtos, prestam serviços ou os dois.">
            A base é a mesma, e cada negócio usa os módulos que fazem sentido para a rotina.
          </Heading>
          <ul className="mt-12 border-t border-border">
            {SEGMENTS.map((segment, index) => (
              <li key={segment.name}>
                <Reveal delay={index * 50}>
                  <Link href="/para-quem-e" className="site-row">
                    <segment.icon className="site-row__icon h-7 w-7 shrink-0" aria-hidden="true" />
                    <h3 className="site-row__name">{segment.name}</h3>
                    <div className="site-row__info">
                      <p className="text-sm text-muted-foreground">{segment.description}</p>
                      <p className="mt-1 text-sm text-foreground">
                        <span className="text-muted-foreground">Módulos indicados: </span>
                        {modulesByName(segment.modules)
                          .map((feature) => feature.name)
                          .join(", ")}
                      </p>
                    </div>
                    <ArrowRight className="site-row__arrow h-5 w-5 shrink-0" aria-hidden="true" />
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
          <MoreLink href="/para-quem-e">Ver a rotina de cada negócio</MoreLink>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="site-section site-band" aria-labelledby="como-title">
        <div className="container">
          <Heading id="como-title" title="Da conta criada à rotina organizada em três passos.">
            Você entra, configura o essencial e começa a administrar.
          </Heading>
          <Reveal className="mt-14">
            <ol className="grid gap-10 md:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step.number}>
                  <span className="site-draw" style={{ transitionDelay: `${index * 250}ms` }} aria-hidden="true" />
                  <p className="site-big-number" aria-hidden="true">
                    {index + 1}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    <span className="sr-only">Passo {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* DIFERENCIAIS REAIS */}
      <section id="diferenciais" className="site-section" aria-labelledby="dif-title">
        <div className="container grid gap-14 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-8">
            <Heading id="dif-title" title="O que torna o Prime Ges diferente na prática." />
            <MarketingPhoto slot="pagamento" className="aspect-[3/2]" sizes="40vw" />
          </div>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {DIFFERENTIALS.map((item, index) => (
              <li key={item.title} className="site-cell">
                <Reveal delay={index * 80}>
                  <item.icon className="site-cell__icon h-7 w-7" aria-hidden="true" />
                  <h3 className="mt-6 text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PLANOS — catálogo do banco */}
      <section id="precos" className="site-section site-band" aria-labelledby="precos-title">
        <div className="container">
          <Heading id="precos-title" title="Escolha o período que faz sentido para o seu negócio.">
            Comece com o teste e avance para o plano que acompanha a sua operação.
          </Heading>
          <PricingGrid views={views} />
          <MoreLink href="/precos">Entender o pagamento e a ordem de pagamento</MoreLink>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="site-section" aria-labelledby="faq-title">
        <div className="container grid gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
            <Heading id="faq-title" title="O que você precisa saber antes de começar." />
            <nav aria-label="Dúvidas mais buscadas">
              <ul className="flex flex-col gap-3">
                {HOME_DOUBTS.map((doubt) => (
                  <li key={doubt.slug}>
                    <Link href={doubtPath(doubt.slug)} className="site-link text-base text-foreground">
                      {doubt.question}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Link href="/duvidas" className="site-link inline-flex min-h-11 w-fit items-center gap-2 text-base font-semibold text-foreground">
              Ver todas as dúvidas
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <FaqList items={faq} />
        </div>
      </section>

      <FinalCta trialLabel={trialLabel} />
    </MarketingShell>
  );
}
