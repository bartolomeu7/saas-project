"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  Gift,
  Package,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "produtos", label: "Produtos", icon: Package },
  { id: "servicos", label: "Serviços", icon: Wrench },
  { id: "vendas", label: "Vendas", icon: ShoppingCart },
  { id: "fidelidade", label: "Fidelidade", icon: Gift },
  { id: "caixa", label: "Caixa", icon: Banknote },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_DATA: Record<
  TabId,
  {
    eyebrow: string;
    title: string;
    description: string;
    accent: string;
    rows: Array<{ label: string; meta: string; value: string }>;
    footer: string;
  }
> = {
  clientes: {
    eyebrow: "Relacionamento",
    title: "Clientes organizados.",
    description: "Centralize cadastros, histórico e informações importantes da sua base.",
    accent: "blue",
    rows: [
      { label: "Ana Souza", meta: "Cliente ativa", value: "Hoje" },
      { label: "Mercado Central", meta: "Empresa", value: "Hoje" },
      { label: "João Santos", meta: "Cliente ativa", value: "Ontem" },
      { label: "Mariana Costa", meta: "Cliente ativa", value: "Ontem" },
    ],
    footer: "Prévia ilustrativa do módulo de clientes",
  },
  produtos: {
    eyebrow: "Catálogo",
    title: "Produtos no lugar certo.",
    description: "Mantenha categorias, preços e informações do catálogo organizados.",
    accent: "violet",
    rows: [
      { label: "Café especial", meta: "Categoria: bebidas", value: "Ativo" },
      { label: "Combo café + pão", meta: "Categoria: combos", value: "Ativo" },
      { label: "Lavagem completa", meta: "Catálogo", value: "Ativo" },
      { label: "Pacote premium", meta: "Categoria: serviços", value: "Ativo" },
    ],
    footer: "Prévia ilustrativa de catálogo",
  },
  servicos: {
    eyebrow: "Serviços",
    title: "Serviços fáceis de acompanhar.",
    description: "Tenha serviços e categorias organizados para atender com mais clareza.",
    accent: "cyan",
    rows: [
      { label: "Lavagem completa", meta: "Automotivo", value: "Ativo" },
      { label: "Higienização", meta: "Automotivo", value: "Ativo" },
      { label: "Polimento", meta: "Automotivo", value: "Ativo" },
      { label: "Pacote mensal", meta: "Recorrente", value: "Ativo" },
    ],
    footer: "Prévia ilustrativa do módulo de serviços",
  },
  vendas: {
    eyebrow: "Operação",
    title: "Vendas sem atrito.",
    description: "Registre itens, pagamentos, descontos e cancelamentos em um fluxo direto.",
    accent: "green",
    rows: [
      { label: "Venda #1042", meta: "Pagamento confirmado", value: "Agora" },
      { label: "Venda #1041", meta: "Pagamento confirmado", value: "Hoje" },
      { label: "Venda #1040", meta: "Pagamento confirmado", value: "Hoje" },
      { label: "Venda #1039", meta: "Pagamento confirmado", value: "Hoje" },
    ],
    footer: "Prévia ilustrativa do módulo de vendas",
  },
  fidelidade: {
    eyebrow: "Relacionamento",
    title: "Fidelidade conectada à operação.",
    description: "Configure níveis, campanhas, multiplicadores e resgate de pontos.",
    accent: "pink",
    rows: [
      { label: "Campanha de aniversário", meta: "Ativa", value: "12% bônus" },
      { label: "Cliente nível Ouro", meta: "Programa ativo", value: "2x pontos" },
      { label: "Resgate de pontos", meta: "Disponível", value: "Ativo" },
      { label: "Campanha do mês", meta: "Agendada", value: "Próxima" },
    ],
    footer: "Prévia ilustrativa do programa de fidelidade",
  },
  caixa: {
    eyebrow: "Controle financeiro do dia",
    title: "Caixa com visão clara.",
    description: "Abra, movimente e feche o caixa acompanhando a operação do dia.",
    accent: "amber",
    rows: [
      { label: "Abertura do caixa", meta: "Turno atual", value: "Concluída" },
      { label: "Entrada de venda", meta: "Operação", value: "Agora" },
      { label: "Movimentação", meta: "Operação", value: "Hoje" },
      { label: "Fechamento", meta: "Fim do turno", value: "Pendente" },
    ],
    footer: "Prévia ilustrativa do módulo de caixa",
  },
};

const BAR_SETS: Record<TabId, number[]> = {
  clientes: [36, 44, 58, 48, 72, 66, 78, 84],
  produtos: [48, 36, 66, 54, 74, 62, 80, 70],
  servicos: [42, 55, 48, 70, 64, 76, 60, 86],
  vendas: [30, 54, 46, 72, 58, 82, 69, 90],
  fidelidade: [28, 46, 38, 58, 72, 64, 78, 88],
  caixa: [40, 52, 44, 70, 62, 74, 68, 82],
};

function DashboardVisual({ activeTab }: { activeTab: TabId }) {
  const data = TAB_DATA[activeTab];
  const bars = BAR_SETS[activeTab];

  return (
    <div className="home-v2-dashboard" aria-label="Prévia ilustrativa do Prime Ges">
      <div className="home-v2-dashboard__topbar">
        <div className="home-v2-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="home-v2-dashboard__address">primeges.com.br/app</span>
        <span className="home-v2-dashboard__online">
          <i /> online
        </span>
      </div>

      <div className="home-v2-dashboard__layout">
        <aside className="home-v2-dashboard__sidebar" aria-hidden="true">
          <div className="home-v2-sidebar-logo">PG</div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <span key={tab.id} className={cn("home-v2-sidebar-icon", tab.id === activeTab && "is-active")}>
                <Icon size={14} />
              </span>
            );
          })}
        </aside>

        <div className="home-v2-dashboard__content">
          <div className="home-v2-dashboard__heading">
            <div>
              <small>{data.eyebrow}</small>
              <h3>{data.title}</h3>
            </div>
            <span className={cn("home-v2-demo-pill", "home-v2-tone-" + data.accent)}>
              Prévia
            </span>
          </div>

          <p className="home-v2-dashboard__description">{data.description}</p>

          <div className="home-v2-dashboard__stats">
            <div>
              <small>Visão do módulo</small>
              <strong>Organizado</strong>
            </div>
            <div>
              <small>Operação</small>
              <strong>Em um só lugar</strong>
            </div>
            <div>
              <small>Experiência</small>
              <strong>Simples</strong>
            </div>
          </div>

          <div className="home-v2-dashboard__workarea">
            <div className="home-v2-dashboard__chart">
              <div className="home-v2-chart-top">
                <div>
                  <small>Atividade</small>
                  <strong>Visão da operação</strong>
                </div>
                <span>Dados demonstrativos</span>
              </div>
              <div className="home-v2-chart-grid">
                {[25, 50, 75].map((value) => (
                  <i key={value} style={{ bottom: value + "%" }} />
                ))}
                <div className="home-v2-bars" aria-hidden="true">
                  {bars.map((height, index) => (
                    <b key={index} style={{ height: height + "%", animationDelay: index * 55 + "ms" }} />
                  ))}
                </div>
              </div>
              <div className="home-v2-chart-foot">
                <span>Seg</span>
                <span>Ter</span>
                <span>Qua</span>
                <span>Qui</span>
                <span>Sex</span>
                <span>Sáb</span>
                <span>Dom</span>
              </div>
            </div>

            <div className="home-v2-dashboard__list">
              <div className="home-v2-list-heading">
                <span>Atividade recente</span>
                <span>Ver tudo</span>
              </div>
              {data.rows.map((row, index) => (
                <div className="home-v2-row" key={row.label}>
                  <span className={cn("home-v2-row-number", "home-v2-tone-" + data.accent)}>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{row.label}</strong>
                    <small>{row.meta}</small>
                  </div>
                  <b>{row.value}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="home-v2-dashboard__footer">
            <span><Check size={12} /> Interface demonstrativa</span>
            <span>{data.footer}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeProductShowcase() {
  const [activeTab, setActiveTab] = useState<TabId>("clientes");
  const active = useMemo(() => TAB_DATA[activeTab], [activeTab]);

  return (
    <div className="home-v2-showcase">
      <div className="home-v2-showcase__tabs" role="tablist" aria-label="Módulos do Prime Ges">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn("home-v2-tab", selected && "is-active")}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="home-v2-showcase__copy">
        <div>
          <span className={cn("home-section-eyebrow", "home-v2-eyebrow-" + active.accent)}>{active.eyebrow}</span>
          <h3 key={activeTab}>{active.title}</h3>
        </div>
        <p key={activeTab + "-description"}>{active.description}</p>
      </div>

      <div className="home-v2-showcase__screen">
        <DashboardVisual activeTab={activeTab} />
      </div>

      <div className="home-v2-showcase__hint">
        <span>Explore os módulos</span>
        <ArrowRight size={13} />
        <span>Os dados exibidos aqui são demonstrativos.</span>
      </div>
    </div>
  );
}

export function HomeHeroMockup() {
  return (
    <div className="home-v2-hero-mockup" aria-label="Prévia ilustrativa do painel Prime Ges">
      <div className="home-v2-hero-mockup__halo" aria-hidden="true" />
      <div className="home-v2-hero-mockup__card">
        <div className="home-v2-hero-mockup__top">
          <div>
            <small>PAINEL DO NEGÓCIO</small>
            <strong>Organize. Venda. Acompanhe.</strong>
          </div>
          <span><i /> online</span>
        </div>

        <div className="home-v2-hero-mockup__metrics">
          <div><small>Clientes</small><strong>Organizados</strong><span>↗</span></div>
          <div><small>Vendas</small><strong>Em um só lugar</strong><span>↗</span></div>
          <div><small>Caixa</small><strong>Sob controle</strong><span>↗</span></div>
        </div>

        <div className="home-v2-hero-mockup__chart">
          <div className="home-v2-hero-chart-grid">
            {[18, 39, 57, 76].map((value) => (
              <i key={value} style={{ bottom: value + "%" }} />
            ))}
          </div>
          <div className="home-v2-hero-chart-bars" aria-hidden="true">
            {[34, 48, 42, 66, 54, 76, 64, 84, 72, 91].map((height, index) => (
              <b key={index} style={{ height: height + "%", animationDelay: index * 45 + "ms" }} />
            ))}
          </div>
          <div className="home-v2-hero-chart-label">Atividade da operação · dados demonstrativos</div>
        </div>

        <div className="home-v2-hero-mockup__row">
          {TABS.slice(0, 4).map((tab) => {
            const Icon = tab.icon;
            return (
              <div key={tab.id}>
                <span className={"home-v2-dot home-v2-tone-" + (tab.id === "clientes" ? "blue" : tab.id === "produtos" ? "violet" : tab.id === "servicos" ? "cyan" : "green")}>
                  <Icon size={12} />
                </span>
                <small>{tab.label}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="home-v2-hero-badge home-v2-hero-badge--top">
        <span className="home-v2-badge-icon"><Users size={13} /></span>
        <div><small>Clientes</small><strong>Tudo organizado</strong></div>
      </div>

      <div className="home-v2-hero-badge home-v2-hero-badge--bottom">
        <span className="home-v2-badge-icon home-v2-tone-green"><BarChart3 size={13} /></span>
        <div><small>Vendas</small><strong>Fluxo simples</strong></div>
      </div>
    </div>
  );
}
