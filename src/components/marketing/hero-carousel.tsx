"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  CircleDollarSign,
  Gift,
  Package,
  Pause,
  Play,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    id: "overview",
    eyebrow: "Gestão do negócio",
    title: "A gestão do seu negócio.",
    highlight: "Finalmente no mesmo lugar.",
    description: "Clientes, produtos, serviços, vendas, fidelidade e caixa em uma experiência moderna para você operar melhor.",
    type: "dashboard",
    icon: BarChart3,
    tone: "blue",
  },
  {
    id: "clientes",
    eyebrow: "Clientes",
    title: "Conheça melhor seus clientes.",
    highlight: "Organize o relacionamento.",
    description: "Cadastros e informações importantes em um fluxo simples para o dia a dia.",
    type: "module",
    icon: Users,
    tone: "blue",
  },
  {
    id: "produtos",
    eyebrow: "Produtos",
    title: "Seu catálogo sempre à mão.",
    highlight: "Mais organização na operação.",
    description: "Mantenha produtos e preços estruturados para encontrar o que precisa com rapidez.",
    type: "module",
    icon: Package,
    tone: "violet",
  },
  {
    id: "servicos",
    eyebrow: "Serviços",
    title: "Cada atendimento no fluxo certo.",
    highlight: "Sem perder o contexto.",
    description: "Organize serviços e acompanhe cada etapa sem espalhar informações.",
    type: "module",
    icon: Wrench,
    tone: "cyan",
  },
  {
    id: "vendas",
    eyebrow: "Vendas",
    title: "Venda com agilidade.",
    highlight: "Sem perder o contexto.",
    description: "Itens, pagamentos, descontos e cancelamentos em um fluxo direto.",
    type: "module",
    icon: BarChart3,
    tone: "green",
  },
  {
    id: "fidelidade",
    eyebrow: "Fidelidade",
    title: "Faça cada compra valer mais.",
    highlight: "Fidelidade no mesmo sistema.",
    description: "Níveis, campanhas, multiplicadores e resgates conectados à operação.",
    type: "module",
    icon: Gift,
    tone: "pink",
  },
  {
    id: "caixa",
    eyebrow: "Caixa",
    title: "O dia termina com clareza.",
    highlight: "Abertura, movimento e fechamento.",
    description: "Controle o caixa sem transformar o fechamento em um quebra-cabeça.",
    type: "module",
    icon: Banknote,
    tone: "amber",
  },
  {
    id: "woman",
    eyebrow: "Na prática",
    title: "Trabalhe no Prime Ges.",
    highlight: "De onde estiver.",
    description: "Uma experiência pensada para caber na rotina de quem realmente toca o negócio.",
    type: "woman",
    icon: Sparkles,
    tone: "violet",
  },
] as const;

const FIRST_SLIDE = SLIDES[0]!;
const FIRST_MODULE_SLIDE = SLIDES[1]!;

const MODULE_CARDS = [
  ["Clientes", Users, "Veja cadastros, histórico e informações do relacionamento."],
  ["Produtos", Package, "Organize catálogo e preços sem espalhar a informação."],
  ["Serviços", Wrench, "Acompanhe serviços e atendimentos em um só lugar."],
  ["Vendas", BarChart3, "Registre a venda e mantenha o fluxo direto."],
  ["Fidelidade", Gift, "Conecte pontos, níveis e campanhas à venda."],
  ["Caixa", Banknote, "Abra, movimente e feche o dia com clareza."],
] as const;

function DashboardVisual() {
  return (
    <div className="hero-carousel-dashboard">
      <div className="hero-dashboard-toolbar"><span /><span /><span /></div>
      <div className="hero-dashboard-body">
        <aside className="hero-dashboard-sidebar">
          <div className="hero-dashboard-logo">PG</div>
          {[BarChart3, Users, Package, Wrench, Gift, Banknote].map((Icon, index) => (
            <span key={index} className={cn("hero-dashboard-side-item", index === 0 && "is-active")}><Icon size={14} /></span>
          ))}
        </aside>
        <div className="hero-dashboard-main">
          <div className="hero-dashboard-heading">
            <div>
              <small>Visão geral</small>
              <strong>Seu negócio, no seu ritmo.</strong>
            </div>
            <span className="hero-live">● online</span>
          </div>
          <div className="hero-dashboard-module-grid">
            {MODULE_CARDS.slice(0, 4).map(([label, Icon]) => (
              <div className="hero-dashboard-module" key={label}>
                <span><Icon size={14} /></span>
                <div><small>{label}</small><strong>Disponível</strong></div>
              </div>
            ))}
          </div>
          <div className="hero-dashboard-chart-card">
            <div className="hero-dashboard-chart-head">
              <div><small>Visão ilustrativa</small><strong>Atividade da operação</strong></div>
              <span>Prime Ges</span>
            </div>
            <div className="hero-dashboard-chart">
              {[42, 63, 51, 78, 58, 84, 66, 92].map((height, index) => (
                <i key={index} style={{ height: height + "%" }} />
              ))}
            </div>
            <div className="hero-dashboard-chart-foot"><span>Interface demonstrativa</span><span>Dados reais no app</span></div>
          </div>
          <div className="hero-dashboard-quick">
            <span><Users size={13} /> Clientes</span>
            <span><Banknote size={13} /> Caixa</span>
            <span><CircleDollarSign size={13} /> Operação</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleVisual({ index }: { index: number }) {
  const data = MODULE_CARDS[index] ?? MODULE_CARDS[0];
  const [label, Icon] = data;
  const slide = SLIDES[index + 1] ?? FIRST_MODULE_SLIDE;
  const rows = [
    ["Hoje", "Atividade recente", "Organizado"],
    ["Agora", "Acesso rápido", "Disponível"],
    ["Fluxo", "Operação", "Pronto"],
  ];

  return (
    <div className="hero-carousel-module-visual">
      <div className="hero-module-visual-top">
        <div className={cn("hero-module-visual-icon", "hero-tone--" + slide.tone)}><Icon size={18} /></div>
        <div><small>Prime Ges / {label}</small><strong>{slide.title}</strong></div>
      </div>
      <div className="hero-module-visual-grid">
        <div className="hero-module-focus">
          <span className="hero-mini-label">Módulo</span>
          <strong>{label}</strong>
          <div className="hero-focus-line"><i /><i /><i /></div>
          <div className="hero-focus-pill">Disponível</div>
        </div>
        <div className="hero-module-list">
          {rows.map(([a, b, c], rowIndex) => (
            <div key={rowIndex} className="hero-module-row">
              <span className="hero-row-index">0{rowIndex + 1}</span>
              <div><strong>{b}</strong><small>{a}</small></div>
              <em>{c}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="hero-module-activity">
        <span>Movimento do módulo</span>
        <div>{[32, 48, 44, 71, 60, 82, 68, 90].map((h, i) => <i key={i} style={{ height: h + "%" }} />)}</div>
      </div>
    </div>
  );
}

function WomanVisual() {
  return (
    <div className="hero-carousel-woman">
      <div className="hero-woman-scene">
        <div className="hero-woman-glow" />
        <div className="hero-woman-window"><span /><span /><span /></div>
        <div className="hero-woman-shelf" />
        <div className="hero-woman-plant" />
        <div className="hero-woman-chair" />
        <div className="hero-woman-person">
          <div className="hero-woman-hair" />
          <div className="hero-woman-head" />
          <div className="hero-woman-neck" />
          <div className="hero-woman-body" />
          <div className="hero-woman-arm" />
        </div>
        <div className="hero-woman-laptop">
          <div className="hero-woman-screen">
            <div className="hero-woman-screen-top"><span /><span /><span /><span /></div>
            <div className="hero-woman-screen-grid">
              <i /><i /><i /><i /><i /><i />
            </div>
            <div className="hero-woman-screen-bars"><span /><span /><span /><span /><span /></div>
          </div>
          <div className="hero-woman-laptop-base" />
        </div>
      </div>
      <div className="hero-woman-card">
        <span><Sparkles size={13} /> Prime Ges</span>
        <strong>Operação no seu ritmo.</strong>
        <small>Interface feita para acompanhar o dia.</small>
      </div>
    </div>
  );
}

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = SLIDES[index] ?? FIRST_SLIDE;

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % SLIDES.length), 5600);
    return () => window.clearInterval(timer);
  }, [paused]);

  const moduleIndex = useMemo(() => Math.max(0, index - 1), [index]);

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="Apresentação visual do Prime Ges"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="hero-carousel-stage">
        <div key={slide.id} className="hero-carousel-copy prime-reveal prime-reveal--visible">
          <span className="hero-carousel-kicker">
            <span className={cn("hero-carousel-kicker-dot", "hero-tone--" + slide.tone)} />
            {slide.eyebrow}
            <Sparkles size={13} />
          </span>
          <h1>{slide.title}<span>{slide.highlight}</span></h1>
          <p>{slide.description}</p>
          <div className="hero-carousel-actions">
            <a href="/register" className="home-btn-primary hero-carousel-primary">Começar agora <ArrowRight size={17} /></a>
            <a href="#produto" className="home-btn-secondary hero-carousel-secondary">Ver por dentro <Play size={14} fill="currentColor" /></a>
          </div>
          <div className="hero-carousel-trust">
            <span><Check size={12} /> Sem complicação</span>
            <span><Check size={12} /> Na nuvem</span>
            <span><Check size={12} /> Acesso rápido</span>
          </div>
        </div>

        <div className="hero-carousel-media" aria-live="polite">
          <div key={slide.id + "-media"} className="hero-carousel-media-enter">
            {slide.type === "dashboard" ? <DashboardVisual /> : null}
            {slide.type === "module" ? <ModuleVisual index={moduleIndex} /> : null}
            {slide.type === "woman" ? <WomanVisual /> : null}
          </div>
        </div>
      </div>

      <div className="hero-carousel-controls">
        <button type="button" className="hero-carousel-arrow" onClick={() => setIndex((value) => (value - 1 + SLIDES.length) % SLIDES.length)} aria-label="Slide anterior">
          <ArrowLeft size={15} />
        </button>
        <div className="hero-carousel-dots">
          {SLIDES.map((item, dotIndex) => (
            <button
              type="button"
              key={item.id}
              className={cn("hero-carousel-dot", dotIndex === index && "is-active")}
              onClick={() => setIndex(dotIndex)}
              aria-label={"Ir para " + item.eyebrow}
              aria-current={dotIndex === index ? "true" : undefined}
            />
          ))}
        </div>
        <button type="button" className="hero-carousel-arrow" onClick={() => setIndex((value) => (value + 1) % SLIDES.length)} aria-label="Próximo slide">
          <ArrowRight size={15} />
        </button>
        <button type="button" className="hero-carousel-pause" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Continuar carrossel" : "Pausar carrossel"}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>

      <div className="hero-carousel-module-rail" aria-label="Módulos do Prime Ges">
        <div className="hero-module-rail-grid">
          {MODULE_CARDS.map(([label, Icon, description], railIndex) => (
            <button
              type="button"
              key={label}
              className={cn("hero-module-rail-item", index === railIndex + 1 && "is-active")}
              onClick={() => setIndex(railIndex + 1)}
              aria-label={"Mostrar " + label}
            >
              <span className={cn("hero-module-rail-icon", "hero-tone--" + (SLIDES[railIndex + 1] ?? FIRST_MODULE_SLIDE).tone)}><Icon size={15} /></span>
              <span className="hero-module-rail-copy"><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
