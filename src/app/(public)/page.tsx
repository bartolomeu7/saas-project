import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Check,
  Gift,
  Package,
  ShoppingCart,
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
import { Reveal, ScrollProgress } from "@/components/marketing/motion";
import {
  SEGMENTS,
  FEATURES,
  PRICING_PLANS,
  HOW_IT_WORKS_STEPS,
  CUSTOM_PLAN,
} from "@/config/marketing";
import { HomeHeroMockup, HomeProductShowcase } from "@/components/marketing/home-product-showcase";

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

const AVAILABLE_FEATURES = FEATURES.filter((feature) => feature.available);
const UPCOMING_FEATURES = FEATURES.filter((feature) => !feature.available);

const SEGMENT_DETAILS: Record<string, string[]> = {
  Padarias: ["Produtos", "Vendas", "Clientes", "Caixa"],
  Mercadinhos: ["Produtos", "Vendas", "Clientes", "Caixa"],
  Restaurantes: ["Clientes", "Vendas", "Produtos", "Caixa"],
  Lanchonetes: ["Clientes", "Vendas", "Produtos", "Caixa"],
  "Lava-rápidos": ["Clientes", "Serviços", "Vendas", "Caixa"],
  "Estética automotiva": ["Clientes", "Serviços", "Fidelidade", "Caixa"],
};

const SEGMENT_IMAGES: Record<string, string> = {
  Padarias:
    "https://images.unsplash.com/photo-1567995512752-015cd3edb4e8?auto=format&fit=crop&fm=jpg&q=82&w=1000",
  Mercadinhos:
    "https://images.unsplash.com/photo-1751151950056-cfaf797f4653?auto=format&fit=crop&fm=jpg&q=82&w=1000",
  Restaurantes:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&fm=jpg&q=82&w=1000",
  Lanchonetes:
    "https://images.unsplash.com/photo-1783499218612-b2cb8767a68e?auto=format&fit=crop&fm=jpg&q=82&w=1000",
  "Lava-rápidos":
    "https://images.unsplash.com/photo-1779723045199-66fc523a842d?auto=format&fit=crop&fm=jpg&q=82&w=1000",
  "Estética automotiva":
    "https://images.unsplash.com/photo-1779723045199-66fc523a842d?auto=format&fit=crop&fm=jpg&q=82&w=1000",
};

const SEGMENT_ICONS: Record<string, typeof Users> = {
  Padarias: Package,
  Mercadinhos: ShoppingCart,
  Restaurantes: Users,
  Lanchonetes: ShoppingCart,
  "Lava-rápidos": Wrench,
  "Estética automotiva": Sparkles,
};

export default function HomePage() {
  return (
    <>
      <ScrollProgress />
      <SiteHeader />

      <main>
        <section id="topo" className="home-v2-hero">
          <div className="home-v2-hero__grid" aria-hidden="true" />
          <div className="home-v2-hero__orb home-v2-hero__orb--one" aria-hidden="true" />
          <div className="home-v2-hero__orb home-v2-hero__orb--two" aria-hidden="true" />

          <div className="container relative z-10">
            <div className="home-v2-hero__layout">
              <div className="home-v2-hero__copy">
                <Reveal>
                  <span className="home-v2-kicker">
                    <i />
                    Gestão para pequenos negócios
                    <Sparkles size={13} />
                  </span>
                </Reveal>

                <Reveal delay={60}>
                  <h1>
                    A gestão do seu negócio.
                    <span>Simples, organizada e em um só lugar.</span>
                  </h1>
                </Reveal>

                <Reveal delay={120}>
                  <p>
                    Clientes, produtos, serviços, vendas, fidelidade e caixa em uma única
                    plataforma, feita para a rotina de quem precisa administrar sem complicação.
                  </p>
                </Reveal>

                <Reveal delay={180}>
                  <div className="home-v2-hero__actions">
                    <Link
                      href={siteConfig.links.register}
                      className={cn(buttonVariants({ size: "lg" }), "home-v2-primary-btn")}
                    >
                      Começar agora
                      <ArrowRight size={17} />
                    </Link>
                    <a
                      href="#produto"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "lg" }),
                        "home-v2-secondary-btn",
                      )}
                    >
                      Ver o sistema
                    </a>
                  </div>
                </Reveal>

                <Reveal delay={230}>
                  <div className="home-v2-hero__trust">
                    <span><Check size={13} /> Na nuvem</span>
                    <span><Check size={13} /> Fácil de usar</span>
                    <span><Check size={13} /> Acesso rápido</span>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={120} distance={28} duration={760}>
                <HomeHeroMockup />
              </Reveal>
            </div>
          </div>
        </section>

        <section id="produto" className="home-v2-product-section">
          <div className="container">
            <Reveal>
              <div className="home-v2-section-heading home-v2-section-heading--center">
                <span className="home-section-eyebrow">Conheça o Prime Ges</span>
                <h2>Tudo o que sua operação precisa, em uma experiência simples.</h2>
                <p>
                  Explore os principais módulos e veja como o Prime Ges organiza diferentes
                  partes da rotina em uma única experiência.
                </p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <HomeProductShowcase />
            </Reveal>
          </div>
        </section>

        <section id="recursos" className="home-v2-modules-section">
          <div className="container">
            <Reveal>
              <div className="home-v2-section-heading">
                <span className="home-section-eyebrow">Módulos</span>
                <h2>O que já está disponível no Prime Ges.</h2>
                <p>
                  O catálogo abaixo reflete os recursos que a plataforma apresenta hoje.
                  O que ainda está em desenvolvimento aparece separado.
                </p>
              </div>
            </Reveal>

            <div className="home-v2-module-grid">
              {AVAILABLE_FEATURES.map((feature, index) => (
                <Reveal key={feature.name} delay={index * 45}>
                  <article className="home-v2-module-card">
                    <div className="home-v2-module-card__top">
                      <span className="home-v2-module-card__icon">
                        <feature.icon size={18} />
                      </span>
                      <span className="home-v2-available"><i /> Disponível</span>
                    </div>
                    <h3>{feature.name}</h3>
                    <p>{feature.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>

            {UPCOMING_FEATURES.length > 0 && (
              <Reveal delay={120}>
                <div className="home-v2-upcoming">
                  <div>
                    <span className="home-section-eyebrow">Em desenvolvimento</span>
                    <h3>Próximas expansões</h3>
                    <p>Alguns módulos já aparecem no planejamento do produto, mas ainda não fazem parte do uso atual.</p>
                  </div>
                  <div className="home-v2-upcoming__items">
                    {UPCOMING_FEATURES.map((feature) => (
                      <span key={feature.name}>
                        <feature.icon size={14} />
                        {feature.name}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        </section>

        <section id="segmentos" className="home-v2-segments-section">
          <div className="container">
            <Reveal>
              <div className="home-v2-section-heading home-v2-section-heading--compact">
                <span className="home-section-eyebrow">Para quem é</span>
                <h2>O sistema acompanha o jeito que o seu negócio funciona.</h2>
                <p>
                  Diferentes operações podem usar a mesma base, escolhendo os módulos que fazem
                  sentido para sua rotina.
                </p>
              </div>
            </Reveal>

            <div className="home-v2-segment-grid">
              {SEGMENTS.map((segment, index) => {
                const Icon = SEGMENT_ICONS[segment.name] ?? Users;
                const modules = SEGMENT_DETAILS[segment.name] ?? [];

                return (
                  <Reveal key={segment.name} delay={index * 45}>
                    <article className="home-v2-segment-card">
                      <div
                        className="home-v2-segment-card__media"
                        style={{ backgroundImage: "url(" + (SEGMENT_IMAGES[segment.name] ?? "") + ")" }}
                        role="img"
                        aria-label={"Imagem ilustrativa para " + segment.name}
                      >
                        <span><Icon size={17} /></span>
                        <div aria-hidden="true" />
                      </div>
                      <div className="home-v2-segment-card__body">
                        <strong>{segment.name}</strong>
                        <p>{segment.description}</p>
                        <div className="home-v2-tag-row">
                          {modules.map((module) => (
                            <span key={module}>{module}</span>
                          ))}
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="home-v2-flow-section">
          <div className="container">
            <Reveal>
              <div className="home-v2-section-heading home-v2-section-heading--center">
                <span className="home-section-eyebrow">Como funciona</span>
                <h2>Da conta criada à rotina organizada em três passos.</h2>
                <p>Sem fluxo complicado. Você entra, configura o essencial e começa a administrar.</p>
              </div>
            </Reveal>

            <div className="home-v2-flow-grid">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <Reveal key={step.number} delay={index * 70}>
                  <article className="home-v2-flow-card">
                    <span>{step.number}</span>
                    <h3>
                      {index === 0 && "Crie sua conta"}
                      {index === 1 && "Configure sua operação"}
                      {index === 2 && "Comece a administrar"}
                    </h3>
                    <p>
                      {index === 0 && "Cadastre sua empresa e entre no seu ambiente."}
                      {index === 1 && "Adicione clientes, produtos e serviços para começar."}
                      {index === 2 && "Registre vendas, acompanhe o caixa e organize a rotina."}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="precos" className="home-v2-pricing-section">
          <div className="container">
            <Reveal>
              <div className="home-v2-section-heading home-v2-section-heading--center">
                <span className="home-section-eyebrow">Planos</span>
                <h2>Escolha o período que faz sentido para o seu negócio.</h2>
                <p>Comece com o teste e avance para o plano que acompanha sua operação.</p>
              </div>
            </Reveal>

            <div className="home-v2-pricing-grid">
              {PRICING_PLANS.map((plan, index) => (
                <Reveal key={plan.id} delay={index * 55}>
                  <PricingCard plan={plan} />
                </Reveal>
              ))}
            </div>

            <Reveal delay={120}>
              <div className="home-v2-custom-plan">
                <div>
                  <span className="home-section-eyebrow">{CUSTOM_PLAN.tagline}</span>
                  <h3>{CUSTOM_PLAN.title}</h3>
                  <p>{CUSTOM_PLAN.description}</p>
                </div>
                <span className="home-v2-custom-note">Canal comercial será ativado nesta etapa.</span>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="home-v2-final">
          <div className="home-v2-final__glow home-v2-final__glow--one" aria-hidden="true" />
          <div className="home-v2-final__glow home-v2-final__glow--two" aria-hidden="true" />
          <div className="container relative">
            <Reveal>
              <div className="home-v2-final__inner">
                <span className="home-v2-final__badge"><Sparkles size={13} /> Prime Ges</span>
                <h2>Organize a operação. Simplifique o dia a dia.</h2>
                <p>
                  Veja o Prime Ges em ação e comece com os recursos que a sua empresa realmente
                  precisa agora.
                </p>
                <div className="home-v2-final__actions">
                  <Link
                    href={siteConfig.links.register}
                    className={cn(buttonVariants({ size: "lg" }), "home-v2-primary-btn")}
                  >
                    Começar agora
                    <ArrowRight size={17} />
                  </Link>
                  <Link
                    href={siteConfig.links.login}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "home-v2-secondary-btn",
                    )}
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
