import type { Metadata } from "next";
import { Check } from "lucide-react";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { Reveal } from "@/components/marketing/motion";
import { FinalCta, Heading, PageHero, modulesByName } from "@/components/marketing/sections";
import { ProductScreen } from "@/components/marketing/screens";
import { MODULE_DETAILS, MODULE_GROUPS, type ScreenId } from "@/config/marketing";

const TITLE = "Recursos";
const DESCRIPTION =
  "Os módulos do Prime Ges: vendas, agenda, orçamentos, estoque, compras, caixa, financeiro, relatórios, equipe e RH, e o que cada um faz.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteConfig.url}/recursos` },
  openGraph: publicOpenGraph("/recursos"),
};

const GROUP_SCREEN: Record<string, ScreenId> = { atendimento: "orcamento", mercadoria: "compra", dinheiro: "relatorios", pessoas: "agenda" };

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <PageHero
        title="Cada módulo resolve uma parte da rotina."
        lead="Veja o que dá para fazer hoje em cada um. Eles usam os mesmos cadastros, então a informação entra uma vez."
        photo="tablet"
        screen="estoque"
      />

      <nav aria-label="Grupos de módulos" className="site-subnav">
        <ul className="container flex gap-2 overflow-x-auto py-3">
          {MODULE_GROUPS.map((group) => (
            <li key={group.id}>
              <a href={`#${group.id}`} className="site-chip">
                {group.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {MODULE_GROUPS.map((group, groupIndex) => (
        <section key={group.id} id={group.id} className={"site-section" + (groupIndex % 2 ? " site-band" : "")} aria-labelledby={`${group.id}-titulo`}>
          <div className="container grid gap-12 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-8 lg:sticky lg:top-36 lg:self-start">
              <Heading id={`${group.id}-titulo`} title={group.title}>
                {group.description}
              </Heading>
              <div className="site-grow">
                <ProductScreen id={GROUP_SCREEN[group.id]!} />
              </div>
            </div>
            <ul className="flex flex-col">
              {modulesByName(group.modules).map((feature) => (
                <li key={feature.name} className="border-b border-border py-8 first:pt-0 last:border-0">
                  <Reveal className="flex gap-5">
                    <feature.icon className="mt-1 h-6 w-6 shrink-0 text-[hsl(var(--site-accent))]" aria-hidden="true" />
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-foreground">{feature.name}</h3>
                      <p className="mt-2 text-base leading-7 text-muted-foreground">{feature.description}</p>
                      <ul className="mt-4 flex flex-col gap-2">
                        {(MODULE_DETAILS[feature.name] ?? []).map((detail) => (
                          <li key={detail} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <FinalCta trialLabel={null} />
    </MarketingShell>
  );
}
