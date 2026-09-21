import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Banknote,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Command,
  Gift,
  LayoutDashboard,
  Package,
  Play,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PricingCard } from "@/components/marketing/pricing-card";
import { AnimatedHeroVisual } from "@/components/marketing/animated-hero-visual";
import { Reveal, ScrollProgress } from "@/components/marketing/motion";
import {
  SEGMENTS,
  FEATURES,
  PRICING_PLANS,
  PROBLEMS,
  SOLUTION_ITEMS,
  HOW_IT_WORKS_STEPS,
  CUSTOM_PLAN,
} from "@/config/marketing";

const SEO_DESCRIPTION =
  "Gerencie clientes, produtos, serviços, vendas, fidelidade e caixa em um só lugar com o Prime Ges.";

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

const MODULES = [
  { label: "Clientes", icon: Users, tone: "blue" },
  { label: "Produtos", icon: Package, tone: "violet" },
  { label: "Serviços", icon: Wrench, tone: "cyan" },
  { label: "Vendas", icon: BarChart3, tone: "green" },
  { label: "Fidelidade", icon: Gift, tone: "pink" },
  { label: "Caixa", icon: Banknote, tone: "amber" },
] as const;

const HERO_CHIPS = ["Clientes", "Produtos", "Serviços", "Vendas", "Fidelidade", "Caixa"];

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1758876017801-f5a892ee460a?auto=format&fit=crop&fm=jpg&q=82&w=1500";

const SEGMENT_IMAGES: Record<string, string> = {
  Padarias: "https://images.unsplash.com/photo-1567995512752-015cd3edb4e8?auto=format&fit=crop&fm=jpg&q=82&w=900",
  Mercadinhos: "https://images.unsplash.com/photo-1751151950056-cfaf797f4653?auto=format&fit=crop&fm=jpg&q=82&w=900",
  Restaurantes: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&fm=jpg&q=82&w=900",
  Lanchonetes: "https://images.unsplash.com/photo-1783499218612-b2cb8767a68e?auto=format&fit=crop&fm=jpg&q=82&w=900",
  "Lava-rápidos": "https://images.unsplash.com/photo-1779723045199-66fc523a842d?auto=format&fit=crop&fm=jpg&q=82&w=900",
  "Estética automotiva": "https://images.unsplash.com/photo-1779723045199-66fc523a842d?auto=format&fit=crop&fm=jpg&q=82&w=900",
};

const BENTO_ITEMS = [
  {
    title: "Clientes no centro",
    description: "Cadastre, encontre e acompanhe clientes sem espalhar informação em várias ferramentas.",
    icon: Users,
    className: "home-bento-card--wide",
    tone: "blue",
  },
  {
    title: "Vendas sem atrito",
    description: "Registre itens, pagamentos, descontos e cancelamentos em um fluxo direto.",
    icon: BarChart3,
    className: "",
    tone: "violet",
  },
  {
    title: "Caixa sob controle",
    description: "Abra, movimente e feche o caixa com uma visão clara do dia.",
    icon: CircleDollarSign,
    className: "",
    tone: "green",
  },
  {
    title: "Produtos + serviços",
    description: "Deixe catálogo, preços e serviços organizados para sua operação.",
    icon: Package,
    className: "home-bento-card--tall",
    tone: "cyan",
  },
  {
    title: "Fidelidade que conversa com a venda",
    description: "Níveis, campanhas, multiplicadores e resgate de pontos no mesmo ecossistema.",
    icon: Gift,
    className: "home-bento-card--wide",
    tone: "pink",
  },
] as const;

function ProductWindow() {
  return (
    <div className="home-product-window">
      <div className="home-window-glow" aria-hidden="true" />
      <div className="home-window-toolbar">
        <div className="home-window-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="home-window-address">
          <span className="home-window-address-dot" />
          primeges.com.br/app
        </div>
        <div className="home-window-profile" />
      </div>

      <div className="home-product-body">
        <aside className="home-product-sidebar" aria-hidden="true">
          <div className="home-sidebar-logo">PG</div>
          {[LayoutDashboard, Users, Package, Wrench, BarChart3, Gift, Banknote].map((Icon, index) => (
            <span key={index} className={cn("home-sidebar-item", index === 0 && "is-active")}>
              <Icon size={15} />
            </span>
          ))}
        </aside>

        <div className="home-product-main">
          <div className="home-product-topline">
            <div>
              <span className="home-product-kicker">Visão geral</span>
              <h3>Seu negócio, no seu ritmo.</h3>
            </div>
            <span className="home-product-status">
              <i /> Sistema online
            </span>
          </div>

          <div className="home-module-grid">
            {MODULES.slice(0, 4).map((module) => (
              <div key={module.label} className="home-module-mini">
                <span className={cn("home-module-mini-icon", `home-tone--${module.tone}`)}>
                  <module.icon size={15} />
                </span>
                <div>
                  <small>{module.label}</small>
                  <strong>Disponível</strong>
                </div>
                <ArrowUpRight size={12} className="home-module-mini-arrow" />
              </div>
            ))}
          </div>

          <div className="home-chart-card">
            <div className="home-chart-heading">
              <div>
                <span>Visual ilustrativo</span>
                <strong>Atividade da operação</strong>
              </div>
              <span className="home-chart-badge">Prime Ges</span>
            </div>
            <div className="home-chart">
              {[25, 45, 65, 85].map((value) => (
                <span key={value} style={{ bottom: value + "%" }} />
              ))}
              <div className="home-chart-bars" aria-hidden="true">
                {[34, 54, 43, 68, 57, 76, 61, 84].map((height, index) => (
                  <i key={index} style={{ "--bar-height": height + "%", "--bar-delay": index * 55 + "ms" } as CSSProperties} />
                ))}
              </div>
            </div>
            <div className="home-chart-footer">
              <span>Dados reais no app</span>
              <span>Interface demonstrativa</span>
            </div>
          </div>

          <div className="home-quick-grid">
            <div className="home-quick-card">
              <span><Users size={14} /></span>
              <div>
                <small>Acesso rápido</small>
                <strong>Clientes</strong>
              </div>
              <ArrowRight size={13} />
            </div>
            <div className="home-quick-card">
              <span><Banknote size={14} /></span>
              <div>
                <small>Acesso rápido</small>
                <strong>Caixa</strong>
              </div>
              <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </div>

      <div className="home-float home-float--top">
        <span className="home-float-icon"><Gift size={15} /></span>
        <div>
          <small>Programa</small>
          <strong>Fidelidade</strong>
        </div>
        <b>Ativo</b>
      </div>

      <div className="home-float home-float--bottom">
        <span className="home-float-icon home-float-icon--green"><CircleDollarSign size={15} /></span>
        <div>
          <small>Módulo</small>
          <strong>Caixa</strong>
        </div>
        <span className="home-float-check">✓</span>
      </div>
    </div>
  );
}

function ShowcasePanel({ kind }: { kind: "clientes" | "vendas" | "caixa" }) {
  const configs = {
    clientes: {
      eyebrow: "Clientes",
      title: "Relacionamento sem bagunça.",
      icon: Users,
      rows: ["Ana Souza", "Mercado Central", "João Santos"],
    },
    vendas: {
      eyebrow: "Vendas",
      title: "Venda com o contexto certo.",
      icon: BarChart3,
      rows: ["Venda #1042", "Venda #1041", "Venda #1040"],
    },
    caixa: {
      eyebrow: "Caixa",
      title: "O dia termina com clareza.",
      icon: Banknote,
      rows: ["Abertura do caixa", "Movimentação", "Fechamento"],
    },
  }[kind];

  return (
    <div className="home-showcase-window">
      <div className="home-showcase-top">
        <span className="home-showcase-icon"><configs.icon size={15} /></span>
        <div>
          <small>{configs.eyebrow}</small>
          <strong>{configs.title}</strong>
        </div>
      </div>
      <div className="home-showcase-lines">
        {configs.rows.map((row, index) => (
          <div key={row} className="home-showcase-row">
            <span className="home-showcase-avatar">{index + 1}</span>
            <div>
              <strong>{row}</strong>
              <small>{index === 0 ? "Agora" : "Hoje"}</small>
            </div>
            <span className="home-showcase-bar"><i style={{ width: (68 - index * 12) + "%" }} /></span>
          </div>
        ))}
      </div>
      <div className="home-showcase-foot">
        <span><Clock3 size={12} /> Visão ilustrativa</span>
        <ArrowUpRight size={13} />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <ScrollProgress />
      <SiteHeader />

      <main>
        <section id="topo" className="home-hero home-hero--reference">
          <div className="home-hero-aurora home-hero-aurora--a" aria-hidden="true" />
          <div className="home-hero-aurora home-hero-aurora--b" aria-hidden="true" />
          <div className="home-hero-grid" aria-hidden="true" />

          <div className="container relative z-10">
            <div className="home-reference-hero-grid">
              <div className="home-hero-copy home-reference-copy">
                <Reveal>
                  <div className="home-kicker">
                    <span className="home-kicker-dot" />
                    Gestão SaaS para pequenos negócios
                    <Sparkles size={13} />
                  </div>
                </Reveal>
                <Reveal delay={70}>
                  <h1>
                    A gestão do seu negócio.
                    <span>Finalmente no mesmo lugar.</span>
                  </h1>
                </Reveal>
                <Reveal delay={140}>
                  <p>
                    Clientes, produtos, serviços, vendas, fidelidade e caixa em uma experiência
                    moderna e simples, para você focar no que realmente importa: o crescimento.
                  </p>
                </Reveal>
                <Reveal delay={210}>
                  <div className="home-hero-actions home-reference-actions">
                    <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "lg" }), "home-btn-primary")}>
                      Começar agora <ArrowRight size={17} />
                    </Link>
                    <a href="#produto" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "home-btn-secondary")}>
                      Ver por dentro <Play size={14} fill="currentColor" />
                    </a>
                  </div>
                </Reveal>
                <Reveal delay={275}>
                  <div className="home-hero-note home-reference-note">
                    <span><Check size={13} /> Sem complicação</span>
                    <span><Check size={13} /> Na nuvem</span>
                    <span><Check size={13} /> Acesso rápido</span>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={120} distance={24} duration={900}>
                <div className="home-reference-visual" aria-label="Prévia visual do Prime Ges">
                  <div
                    className="home-reference-photo"
                    role="img"
                    aria-label="Pessoa empreendedora trabalhando em um notebook"
                    style={{ backgroundImage: "url(" + HERO_IMAGE + ")" }}
                  >
                    <div className="home-reference-photo__overlay" aria-hidden="true" />
                    <div className="home-reference-photo__shine" aria-hidden="true" />
                  </div>
                  <div className="home-reference-dashboard">
                    <AnimatedHeroVisual />
                  </div>
                  <div className="home-reference-status home-reference-status--top">
                    <span><i /> Sistema online</span>
                    <strong>Prime Ges</strong>
                  </div>
                  <div className="home-reference-status home-reference-status--bottom">
                    <span className="home-reference-status__icon"><Sparkles size={14} /></span>
                    <div>
                      <small>Mais controle</small>
                      <strong>para o seu dia a dia</strong>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>

          <div className="home-hero-module-rail" aria-label="Módulos disponíveis">
            <div className="container">
              <div className="home-module-rail-inner home-reference-rail">
                <span className="home-module-rail-label">Já disponível no Prime Ges</span>
                {MODULES.map((module, index) => (
                  <span key={module.label} className={cn("home-reference-module", index === 0 && "is-featured")}>
                    <span className={cn("home-reference-module__icon", "home-tone--" + module.tone)}>
                      <module.icon size={14} />
                    </span>
                    <span>
                      <strong>{module.label}</strong>
                      <small>
                        {module.label === "Clientes" && "Organize sua base"}
                        {module.label === "Produtos" && "Controle seu estoque"}
                        {module.label === "Serviços" && "Gerencie serviços"}
                        {module.label === "Vendas" && "Venda mais"}
                        {module.label === "Fidelidade" && "Clientes sempre com você"}
                        {module.label === "Caixa" && "Tenha tudo sob controle"}
                      </small>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="produto" className="home-intro-section">
          <div className="container">
            <Reveal>
              <div className="home-intro-grid">
                <div>
                  <span className="home-section-eyebrow">Tudo em um só lugar</span>
                  <h2>O essencial da sua operação, sem trocar de sistema.</h2>
                </div>
                <p>
                  Clientes, produtos, serviços, vendas, fidelidade e caixa reunidos em uma experiência feita para a rotina. Menos troca de telas, mais clareza para decidir e agir.
                </p>
              </div>
            </Reveal>

            <div className="home-bento-grid">
              {BENTO_ITEMS.map((item, index) => (
                <Reveal key={item.title} delay={index * 60}>
                  <article className={cn("home-bento-card", item.className)}>
                    <div className="home-bento-top">
                      <span className={cn("home-bento-icon", `home-tone--${item.tone}`)}>
                        <item.icon size={18} />
                      </span>
                      <ArrowUpRight size={15} />
                    </div>
                    <div className="home-bento-content">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                    {item.title === "Clientes no centro" && (
                      <div className="home-mini-list" aria-hidden="true">
                        {["Cliente 01", "Cliente 02", "Cliente 03"].map((label, itemIndex) => (
                          <span key={label}>
                            <i>{itemIndex + 1}</i>
                            {label}
                            <b />
                          </span>
                        ))}
                      </div>
                    )}
                    {item.title === "Vendas sem atrito" && (
                      <div className="home-mini-spark" aria-hidden="true">
                        {[32, 52, 44, 64, 58, 76].map((height, itemIndex) => (
                          <i key={itemIndex} style={{ height: height + "%" }} />
                        ))}
                      </div>
                    )}
                    {item.title === "Caixa sob controle" && (
                      <div className="home-cash-orbit" aria-hidden="true"><span /><i /><b /></div>
                    )}
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="recursos" className="home-modules-section">
          <div className="container">
            <Reveal>
              <div className="home-modules-heading">
                <div>
                  <span className="home-section-eyebrow">Módulos do Prime Ges</span>
                  <h2>Tudo o que você precisa para cuidar da operação.</h2>
                </div>
                <p>
                  Os recursos disponíveis hoje aparecem em primeiro plano. O que ainda está em desenvolvimento fica sinalizado com clareza.
                </p>
              </div>
            </Reveal>

            <div className="home-module-grid-large">
              {FEATURES.map((feature, index) => (
                <Reveal key={feature.name} delay={index * 50}>
                  <article className={cn("home-module-card", !feature.available && "is-soon")}>
                    <div className="home-module-card-top">
                      <span className="home-module-card-icon">
                        <feature.icon size={19} />
                      </span>
                      {feature.available ? (
                        <span className="home-available-dot"><i /> Disponível</span>
                      ) : (
                        <span className="home-soon-pill">Em breve</span>
                      )}
                    </div>
                    <h3>{feature.name}</h3>
                    <p>{feature.description}</p>
                    {feature.available && <ArrowUpRight size={15} className="home-module-card-arrow" />}
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="home-showcase-section">
          <div className="container">
            <div className="home-showcase-header">
              <Reveal>
                <div>
                  <span className="home-section-eyebrow">Veja por dentro</span>
                  <h2>Uma experiência pensada para você entender em poucos segundos.</h2>
                </div>
              </Reveal>
              <Reveal delay={90}>
                <span className="home-showcase-caption"><Command size={14} /> Prévia do sistema</span>
              </Reveal>
            </div>

            <div className="home-showcase-grid">
              <Reveal>
                <ShowcasePanel kind="clientes" />
              </Reveal>
              <Reveal delay={80}>
                <ShowcasePanel kind="vendas" />
              </Reveal>
              <Reveal delay={160}>
                <ShowcasePanel kind="caixa" />
              </Reveal>
            </div>
          </div>
        </section>

        <section id="segmentos" className="home-segments-section">
          <div className="container">
            <Reveal>
              <div className="home-segments-intro">
                <span className="home-section-eyebrow">Feito para o seu negócio</span>
                <h2>Um sistema que acompanha o jeito que o seu negócio funciona.</h2>
                <p>
                  Padarias, mercadinhos, restaurantes, lanchonetes e operações automotivas podem organizar a rotina na mesma base, com módulos que você usa de verdade.
                </p>
              </div>
            </Reveal>

            <div className="home-segment-row home-segment-row--photo">
              {SEGMENTS.map((segment, index) => {
                const image = SEGMENT_IMAGES[segment.name] ?? HERO_IMAGE;
                return (
                  <Reveal key={segment.name} delay={index * 55}>
                    <article className="home-segment-item home-segment-item--photo">
                      <div
                        className="home-segment-media"
                        role="img"
                        aria-label={"Imagem ilustrativa para " + segment.name}
                        style={{
                          backgroundImage: "url(" + image + ")",
                          backgroundPosition: "50% 50%",
                        }}
                      >
                        <span className="home-segment-icon">
                          <segment.icon size={17} />
                        </span>
                        <span className="home-segment-media__sheen" aria-hidden="true" />
                      </div>
                      <div className="home-segment-copy">
                        <strong>{segment.name}</strong>
                        <span>{segment.description}</span>
                      </div>
                      <ArrowRight size={14} />
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="home-story-section">
          <div className="container">
            <div className="home-story-grid">
              <Reveal>
                <div className="home-story-card home-story-card--problem">
                  <span className="home-section-eyebrow">O problema</span>
                  <h3>Quando tudo fica espalhado, a operação perde ritmo.</h3>
                  <div className="home-problem-list">
                    {PROBLEMS.map((problem) => (
                      <span key={problem.title}><i /> {problem.title}</span>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal delay={120}>
                <div className="home-story-card home-story-card--solution">
                  <span className="home-section-eyebrow">Com o Prime Ges</span>
                  <h3>Você concentra o essencial em um só lugar e mantém a rotina visível.</h3>
                  <div className="home-solution-list">
                    {SOLUTION_ITEMS.map((item) => (
                      <span key={item}><Check size={13} /> {item}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="home-start-section">
          <div className="container">
            <Reveal>
              <div className="home-start-heading">
                <span className="home-section-eyebrow">Como começar</span>
                <h2>Da conta criada à gestão do dia a dia em três passos.</h2>
              </div>
            </Reveal>

            <div className="home-start-steps">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <Reveal key={step.number} delay={index * 90}>
                  <div className="home-start-step">
                    <span>{step.number}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>Configure o essencial e siga para o próximo passo.</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="precos" className="home-pricing-section">
          <div className="container">
            <Reveal>
              <div className="home-pricing-intro">
                <span className="home-section-eyebrow">Preços</span>
                <h2>Escolha o plano e comece a organizar.</h2>
                <p>Planos diretos para começar agora e crescer junto com a operação.</p>
              </div>
            </Reveal>

            <div className="home-pricing-grid">
              {PRICING_PLANS.map((plan, index) => (
                <Reveal key={plan.id} delay={index * 70}>
                  <PricingCard plan={plan} />
                </Reveal>
              ))}
            </div>

            <Reveal delay={180}>
              <div className="home-custom-plan">
                <div>
                  <span className="home-section-eyebrow">{CUSTOM_PLAN.tagline}</span>
                  <h3>{CUSTOM_PLAN.title}</h3>
                  <p>{CUSTOM_PLAN.description}</p>
                </div>
                <span className={cn(buttonVariants({ variant: "outline" }), "home-disabled-cta")}>
                  {CUSTOM_PLAN.ctaLabel}
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="home-final-cta">
          <div className="home-final-orbit home-final-orbit--a" aria-hidden="true" />
          <div className="home-final-orbit home-final-orbit--b" aria-hidden="true" />
          <div className="container relative">
            <Reveal>
              <div className="home-final-inner">
                <span className="home-final-badge"><Sparkles size={13} /> Prime Ges</span>
                <h2>Seu negócio merece uma gestão que parece simples.</h2>
                <p>Comece com o que já está pronto. Expanda quando fizer sentido.</p>
                <div className="home-final-actions">
                  <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "lg" }), "home-btn-primary")}>
                    Começar agora
                    <ArrowRight size={17} />
                  </Link>
                  <Link href={siteConfig.links.login} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "home-btn-secondary")}>
                    Entrar
                  </Link>
                </div>
                <a href="#topo" className="home-back-top">
                  Voltar ao topo <ChevronDown size={14} className="-rotate-180" />
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
