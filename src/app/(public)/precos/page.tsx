import type { Metadata } from "next";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { Reveal } from "@/components/marketing/motion";
import { FinalCta, Heading, PricingGrid } from "@/components/marketing/sections";
import { PAYMENT_FACTS } from "@/config/marketing";
import { getPublicPlans } from "@/lib/billing/queries";
import { faqFacts, toPricingView } from "@/lib/billing/pricing-display";

const TITLE = "Preços";
const DESCRIPTION =
  "Planos do Prime Ges por período, pagos por Pix e sem renovação automática. Veja como funciona a ordem de pagamento e a ajuda.";

// Mesma regra da home: catálogo do banco, renovado a cada 60 s e ao salvar um plano no /admin.
export const revalidate = 60;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteConfig.url}/precos` },
  openGraph: publicOpenGraph("/precos"),
};

export default async function PricingPage() {
  const catalog = await getPublicPlans();
  const views = catalog.map(toPricingView);
  const trialLabel = catalog.some((plan) => plan.kind === "trial") ? faqFacts(catalog).trialLabel : null;

  return (
    <MarketingShell>
      <section className="site-section" aria-labelledby="pagina-titulo">
        <div className="container">
          <h1 id="pagina-titulo" className="site-h1 max-w-4xl">
            <span className="site-mask">
              <span>Pague pelo período. Renove só se quiser.</span>
            </span>
          </h1>
          <p className="site-lead prime-enter mt-6 max-w-2xl">
            {trialLabel ? `Comece com o teste grátis de ${trialLabel}. ` : ""}Os planos pagos são pagos por Pix, gerado dentro da plataforma.
          </p>
          <PricingGrid views={views} />
        </div>
      </section>

      <section className="site-section site-band" aria-labelledby="pagamento-titulo">
        <div className="container grid gap-12 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20">
          <Heading id="pagamento-titulo" title="Como funciona o pagamento." className="lg:sticky lg:top-28 lg:self-start">
            Do QR Code à liberação do acesso, você acompanha tudo pela ordem de pagamento.
          </Heading>
          <ol className="flex flex-col gap-4">
            {PAYMENT_FACTS.map((fact, index) => (
              <li key={fact.title}>
                <Reveal delay={index * 70} className="site-moment">
                  <span className="site-big-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{fact.title}</h3>
                    <p className="mt-1 text-base leading-7 text-muted-foreground">{fact.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <FinalCta trialLabel={trialLabel} />
    </MarketingShell>
  );
}
