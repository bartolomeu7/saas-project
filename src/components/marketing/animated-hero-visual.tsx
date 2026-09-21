"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight, Banknote, BarChart3, Gift, Package, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = [
  { label: "Clientes", icon: Users, tone: "blue" },
  { label: "Produtos", icon: Package, tone: "violet" },
  { label: "Serviços", icon: Wrench, tone: "cyan" },
  { label: "Vendas", icon: BarChart3, tone: "green" },
];

const BARS = [26, 42, 35, 57, 48, 71, 59, 82, 68, 88];

export function AnimatedHeroVisual() {
  return (
    <div className="home-hero-float-panel" aria-hidden="true">
      <div className="home-hero-float-panel__shine" />
      <div className="home-hero-float-panel__header">
        <div className="home-hero-float-panel__window">
          <span /><span /><span />
        </div>
        <span className="home-hero-float-panel__title">Prime Ges / Visão geral</span>
        <span className="home-hero-float-panel__signal"><i /> online</span>
      </div>

      <div className="home-hero-float-panel__content">
        <div className="home-hero-dashboard-top">
          <div>
            <small>PAINEL DO NEGÓCIO</small>
            <strong>Organize. Venda. Acompanhe.</strong>
          </div>
          <span className="home-hero-date">Hoje</span>
        </div>

        <div className="home-hero-module-row">
          {MODULES.map((module) => (
            <div key={module.label} className="home-hero-module">
              <span className={cn("home-hero-module__icon", `home-tone--${module.tone}`)}>
                <module.icon size={13} />
              </span>
              <div>
                <small>{module.label}</small>
                <strong>Disponível</strong>
              </div>
              <ArrowUpRight size={11} />
            </div>
          ))}
        </div>

        <div className="home-hero-data-grid">
          <div className="home-hero-data-card home-hero-data-card--chart">
            <div className="home-hero-card-heading">
              <div>
                <small>Visual ilustrativo</small>
                <strong>Atividade da operação</strong>
              </div>
              <span>Prime Ges</span>
            </div>

            <div className="home-hero-bars">
              {BARS.map((height, index) => (
                <i
                  key={index}
                  style={
                    {
                      "--hero-bar-height": height + "%",
                      "--hero-bar-delay": index * 55 + "ms",
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            <div className="home-hero-card-foot">
              <span>Dados reais no app</span>
              <span>Interface demonstrativa</span>
            </div>
          </div>

          <div className="home-hero-side-stack">
            <div className="home-hero-data-card home-hero-data-card--quick">
              <span className="home-hero-quick-icon"><Users size={14} /></span>
              <div>
                <small>Acesso rápido</small>
                <strong>Clientes</strong>
              </div>
              <ArrowUpRight size={12} />
            </div>
            <div className="home-hero-data-card home-hero-data-card--quick">
              <span className="home-hero-quick-icon home-hero-quick-icon--green"><Banknote size={14} /></span>
              <div>
                <small>Acesso rápido</small>
                <strong>Caixa</strong>
              </div>
              <ArrowUpRight size={12} />
            </div>
          </div>
        </div>
      </div>

      <div className="home-hero-floating-note home-hero-floating-note--one">
        <span className="home-hero-note-icon"><Gift size={14} /></span>
        <div><small>Programa</small><strong>Fidelidade</strong></div>
        <b>Ativo</b>
      </div>

      <div className="home-hero-floating-note home-hero-floating-note--two">
        <span className="home-hero-note-icon home-hero-note-icon--green"><Banknote size={14} /></span>
        <div><small>Módulo</small><strong>Caixa</strong></div>
        <span className="home-hero-note-check">✓</span>
      </div>
    </div>
  );
}
