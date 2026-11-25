import type { Metadata } from "next";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { FaqList, FinalCta } from "@/components/marketing/sections";
import { buildFaq } from "@/config/marketing";
import { getPublicPlans } from "@/lib/billing/queries";
import { faqFacts } from "@/lib/billing/pricing-display";

const TITLE = "Perguntas frequentes";
const DESCRIPTION =
  "Respostas sobre o Prime Ges: teste grátis, pagamento por Pix, usuários, agenda, orçamentos, RH, dados da empresa e suporte.";

export const revalidate = 60;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteConfig.url}/perguntas` },
  openGraph: publicOpenGraph("/perguntas"),
};

export default async function QuestionsPage() {
  const catalog = await getPublicPlans();
  const trialLabel = catalog.some((plan) => plan.kind === "trial") ? faqFacts(catalog).trialLabel : null;

  return (
    <MarketingShell>
      <section className="site-section" aria-labelledby="pagina-titulo">
        <div className="container grid gap-12 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <h1 id="pagina-titulo" className="site-h1">
              <span className="site-mask">
                <span>Perguntas frequentes</span>
              </span>
            </h1>
            <p className="site-lead prime-enter">O que você precisa saber antes de criar a conta e depois de começar a usar.</p>
          </div>
          <FaqList items={buildFaq(faqFacts(catalog))} />
        </div>
      </section>
      <FinalCta trialLabel={trialLabel} />
    </MarketingShell>
  );
}
