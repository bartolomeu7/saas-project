import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import type { SettingsNavItem } from "@/lib/settings/nav";

/** Estrutura comum das telas de Configurações da área da empresa: cabeçalho, abas e conteúdo. */
export function SettingsPageShell({
  title,
  description,
  nav,
  wide = false,
  children,
}: {
  title: string;
  description: string;
  nav: SettingsNavItem[];
  /** Visão geral usa a largura toda (grade de atalhos); os formulários ficam numa coluna estreita. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="prime-module-page prime-module-page--configuracoes flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader eyebrow="Configurações" title={title} description={description} />
      <SettingsSubnav items={nav} />
      <div className={wide ? "flex flex-col gap-6" : "flex max-w-3xl flex-col gap-6"}>{children}</div>
    </div>
  );
}
