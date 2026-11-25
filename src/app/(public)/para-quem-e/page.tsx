import type { Metadata } from "next";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { Reveal } from "@/components/marketing/motion";
import { FinalCta, PageHero, modulesByName } from "@/components/marketing/sections";
import { SEGMENTS } from "@/config/marketing";

const TITLE = "Para quem é";
const DESCRIPTION =
  "Como o Prime Ges entra na rotina de padarias, mercadinhos, restaurantes, lanchonetes, lava-rápidos e estética automotiva.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteConfig.url}/para-quem-e` },
  openGraph: publicOpenGraph("/para-quem-e"),
};

export default function AudiencePage() {
  return (
    <MarketingShell>
      <PageHero
        title="Feito para quem atende o cliente e cuida das contas."
        lead="MEIs, microempresas e pequenos negócios que vendem produtos, prestam serviços ou fazem os dois."
        photo="fechamento"
        screen="agenda"
      />

      <div>
        {SEGMENTS.map((segment, index) => (
          <section key={segment.name} className={"site-section" + (index % 2 ? " site-band" : "")} aria-labelledby={`segmento-${index}`}>
            <div className="container grid gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20">
              <Reveal className="flex flex-col items-start gap-5 lg:sticky lg:top-28 lg:self-start">
                <segment.icon className="h-10 w-10 text-[hsl(var(--site-accent))]" aria-hidden="true" />
                <h2 id={`segmento-${index}`} className="site-h2">
                  {segment.name}
                </h2>
                <p className="site-lead">{segment.description}</p>
                <ul className="flex flex-wrap gap-2" aria-label={"Módulos indicados para " + segment.name}>
                  {modulesByName(segment.modules).map((feature) => (
                    <li key={feature.name} className="site-chip">
                      <feature.icon className="h-4 w-4" aria-hidden="true" />
                      {feature.name}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <ol className="flex flex-col gap-4">
                {segment.routine.map((moment, position) => (
                  <li key={moment}>
                    <Reveal delay={position * 90} className="site-moment">
                      <span className="site-big-number" aria-hidden="true">
                        {position + 1}
                      </span>
                      <p className="text-lg leading-8 text-foreground">{moment}</p>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>

      <section className="site-section border-t border-border" aria-labelledby="outro-titulo">
        <div className="container max-w-3xl">
          <h2 id="outro-titulo" className="site-h2">
            O seu ramo não está na lista?
          </h2>
          <p className="site-lead mt-4">
            Se a rotina envolve vender, atender, controlar estoque ou receber, a mesma base serve. O Prime Ges não emite nota fiscal e não
            substitui a contabilidade.
          </p>
        </div>
      </section>

      <FinalCta trialLabel={null} />
    </MarketingShell>
  );
}
