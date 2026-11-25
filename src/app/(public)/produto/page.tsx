import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { Reveal } from "@/components/marketing/motion";
import { MarketingPhoto } from "@/components/marketing/photo";
import { SaleFlow } from "@/components/marketing/sale-flow";
import { ProductScreen } from "@/components/marketing/screens";
import { FinalCta, Heading, PageHero } from "@/components/marketing/sections";
import { CREDIBILITY_ITEMS, OTHER_FLOWS } from "@/config/marketing";

const TITLE = "Como funciona o sistema de gestão";
const DESCRIPTION =
  "Veja por dentro como o Prime Ges liga venda, estoque, caixa, financeiro, agenda, compras e orçamentos, no computador ou no celular.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteConfig.url}/produto` },
  openGraph: publicOpenGraph("/produto"),
};

export default function ProductPage() {
  return (
    <MarketingShell>
      <PageHero
        title="Você lança uma vez. O sistema leva adiante."
        lead="O que acontece no balcão aparece no estoque, no caixa e no financeiro, sem copiar de um lugar para outro."
        photo="pagamento"
        screen="relatorios"
      />

      <section className="site-section" aria-labelledby="venda-titulo">
        <div className="container">
          <Heading id="venda-titulo" title="O caminho de uma venda.">
            Cinco coisas que ficam em dia a partir de um único registro. Os dados das telas são demonstrativos.
          </Heading>
          <div className="mt-14">
            <SaleFlow />
          </div>
        </div>
      </section>

      <section className="site-section site-band" aria-labelledby="fluxos-titulo">
        <div className="container flex flex-col gap-20">
          <Heading id="fluxos-titulo" title="Outros caminhos que já vêm ligados." />
          {OTHER_FLOWS.map((flow, index) => (
            <div key={flow.screen} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
              <Reveal className={index % 2 ? "lg:order-2" : undefined}>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">{flow.title}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{flow.text}</p>
                <ol className="mt-6 flex flex-wrap items-center gap-3">
                  {flow.steps.map((step, position) => (
                    <li key={step} className="flex items-center gap-3">
                      {position > 0 && <ArrowRight className="h-4 w-4 text-[hsl(var(--site-accent))]" aria-hidden="true" />}
                      <span className="site-chip">{step}</span>
                    </li>
                  ))}
                </ol>
              </Reveal>
              <div className="site-grow">
                <ProductScreen id={flow.screen} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" aria-labelledby="base-titulo">
        <div className="container grid items-start gap-14 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <Heading id="base-titulo" title="No computador do escritório ou no celular, no balcão.">
              O Prime Ges abre no navegador. No celular, dá para adicionar à tela inicial e usar como aplicativo, com tema claro ou escuro
              dentro do sistema.
            </Heading>
            <MarketingPhoto slot="fechamento" className="aspect-[3/2]" sizes="45vw" />
          </div>
          <ul className="border-t border-border">
            {CREDIBILITY_ITEMS.map((item, index) => (
              <li key={item.title} className="border-b border-border py-6">
                <Reveal delay={index * 60} className="flex gap-4">
                  <item.icon className="mt-0.5 h-6 w-6 shrink-0 text-[hsl(var(--site-accent))]" aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FinalCta trialLabel={null} />
    </MarketingShell>
  );
}
