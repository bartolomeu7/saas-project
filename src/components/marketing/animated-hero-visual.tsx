"use client";

import type { CSSProperties } from "react";
import { BarChart3, Boxes, CircleDollarSign, Gift, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = [
  { label: "Clientes", icon: Users },
  { label: "Produtos", icon: Boxes },
  { label: "Serviços", icon: Wrench },
  { label: "Vendas", icon: BarChart3 },
];

const BARS = [32, 46, 38, 57, 49, 68, 60, 76, 70, 84];

export function AnimatedHeroVisual() {
  return (
    <div className="prime-hero-stage" aria-hidden="true">
      <div className="prime-hero-orb prime-hero-orb--a" />
      <div className="prime-hero-orb prime-hero-orb--b" />

      <div className="prime-hero-frame">
        <div className="prime-hero-toolbar">
          <div className="prime-window-dots"><span /><span /><span /></div>
          <div className="prime-hero-toolbar-pill">Prime Ges</div>
          <div className="prime-hero-toolbar-user" />
        </div>

        <div className="prime-hero-content">
          <div className="prime-hero-sidebar">
            <div className="prime-sidebar-brand" />
            <span className="active" /><span /><span /><span /><span />
          </div>

          <div className="prime-hero-dashboard">
            <div className="prime-dashboard-heading">
              <div>
                <p className="prime-kicker">Visão geral</p>
                <h3>Seu negócio, em um só lugar.</h3>
              </div>
              <span className="prime-live-dot"><i /> Interface pronta</span>
            </div>

            <div className="prime-stat-grid">
              {MODULES.map((module, index) => (
                <div key={module.label} className="prime-mini-stat">
                  <span className={cn("prime-mini-stat-icon", ["tone-blue", "tone-violet", "tone-cyan", "tone-green"][index])}>
                    <module.icon size={14} />
                  </span>
                  <div>
                    <small>{module.label}</small>
                    <strong>Disponível</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="prime-hero-chart-card">
              <div className="prime-chart-head">
                <div><small>Visão ilustrativa</small><strong>Atividade da operação</strong></div>
                <span>Prime Ges</span>
              </div>
              <div className="prime-chart-grid">
                {[25, 50, 75].map((line) => <span key={line} style={{ bottom: line + "%" }} />)}
                <div className="prime-bars">
                  {BARS.map((height, index) => (
                    <i key={index} style={{ "--bar-height": height + "%", "--bar-delay": index * 45 + "ms" } as CSSProperties} />
                  ))}
                </div>
              </div>
              <div className="prime-chart-footer"><span>Dados reais no app</span><span>Visão ilustrativa</span></div>
            </div>

            <div className="prime-action-row">
              <div className="prime-action-card"><div><small>Atalho</small><strong>Clientes</strong></div><span className="prime-action-status">Disponível</span></div>
              <div className="prime-action-card"><div><small>Atalho</small><strong>Caixa</strong></div><span className="prime-action-status">Disponível</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="prime-float-card prime-float-card--top">
        <span className="prime-float-icon"><Gift size={15} /></span>
        <div><small>Programa</small><strong>Fidelidade</strong></div>
        <b>Ativo</b>
      </div>
      <div className="prime-float-card prime-float-card--bottom">
        <span className="prime-float-icon prime-float-icon--green"><CircleDollarSign size={15} /></span>
        <div><small>Módulo</small><strong>Caixa</strong></div>
        <span className="prime-float-check">✓</span>
      </div>
    </div>
  );
}
