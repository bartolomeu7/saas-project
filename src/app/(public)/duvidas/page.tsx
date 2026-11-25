import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { Reveal } from "@/components/marketing/motion";
import { FaqList, FinalCta, Heading } from "@/components/marketing/sections";
import { buildFaq } from "@/config/marketing";
import { DOUBTS, DOUBT_CATEGORIES, doubtPath } from "@/content/duvidas";
import { getPublicPlans } from "@/lib/billing/queries";
import { faqFacts } from "@/lib/billing/pricing-display";

const TITLE = "Dúvidas sobre sistema para pequenas empresas";
const DESCRIPTION =
  "Respostas às perguntas mais buscadas sobre SaaS e sistema para pequenas empresas: preço, estoque, caixa, vendas, MEI e como escolher.";

export const revalidate = 60;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteConfig.url}/duvidas` },
  openGraph: publicOpenGraph("/duvidas"),
};

export default async function DoubtsPage() {
  const catalog = await getPublicPlans();
  const trialLabel = catalog.some((plan) => plan.kind === "trial") ? faqFacts(catalog).trialLabel : null;

  return (
    <MarketingShell>
      <section className="site-section" aria-labelledby="pagina-titulo">
        <div className="container">
          <h1 id="pagina-titulo" className="site-h1 max-w-4xl">
            <span className="site-mask">
              <span>Dúvidas sobre sistema para pequenas empresas</span>
            </span>
          </h1>
          <p className="site-lead prime-enter mt-6 max-w-2xl">
            As perguntas que mais aparecem para quem está organizando o negócio, com resposta direta e como o Prime Ges ajuda em cada uma.
          </p>

          {DOUBT_CATEGORIES.map((category, index) => (
            <div key={category} className="mt-16">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground" id={`categoria-${index + 1}`}>
                {category}
              </h2>
              <ul className="mt-6 border-t border-border">
                {DOUBTS.filter((doubt) => doubt.category === category).map((doubt) => (
                  <li key={doubt.slug}>
                    <Reveal>
                      <Link href={doubtPath(doubt.slug)} className="site-row site-row--doubt">
                        <h3 className="text-lg font-semibold text-foreground">{doubt.question}</h3>
                        <ArrowRight className="site-row__arrow h-5 w-5 shrink-0" aria-hidden="true" />
                      </Link>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="sobre-o-prime-ges" className="site-section site-band" aria-labelledby="faq-title">
        <div className="container grid gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <Heading id="faq-title" title="Perguntas frequentes sobre o Prime Ges." className="lg:sticky lg:top-28 lg:self-start" />
          <FaqList items={buildFaq(faqFacts(catalog))} />
        </div>
      </section>

      <FinalCta trialLabel={trialLabel} />
    </MarketingShell>
  );
}
