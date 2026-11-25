import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { MarketingShell } from "@/components/marketing/shell";
import { ProductScreen } from "@/components/marketing/screens";
import { FinalCta, PricingGrid, PrimaryCta } from "@/components/marketing/sections";
import { JsonLd } from "@/components/seo/json-ld";
import { DOUBTS, DOUBTS_UPDATED_AT, doubtPath, getDoubt } from "@/content/duvidas";
import { getPublicPlans } from "@/lib/billing/queries";
import { toPricingView } from "@/lib/billing/pricing-display";
import { buildArticleData } from "@/lib/seo/structured-data";

// Só as páginas da lista existem (endereço desconhecido = 404). A de preços lê o catálogo, renovado a cada 60 s.
export const dynamicParams = false;
export const revalidate = 60;

export function generateStaticParams() {
  return DOUBTS.map((doubt) => ({ slug: doubt.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doubt = getDoubt((await params).slug);
  if (!doubt) return {};
  const path = doubtPath(doubt.slug);
  return {
    title: doubt.metaTitle,
    description: doubt.description,
    alternates: { canonical: `${siteConfig.url}${path}` },
    openGraph: publicOpenGraph(path, { title: doubt.question, description: doubt.description }),
  };
}

export default async function DoubtPage({ params }: Props) {
  const doubt = getDoubt((await params).slug);
  if (!doubt) notFound();

  const path = doubtPath(doubt.slug);
  const views = doubt.showPlans ? (await getPublicPlans()).map(toPricingView) : null;
  const breadcrumb = [
    { name: "Início", path: "/" },
    { name: "Dúvidas", path: "/duvidas" },
    { name: doubt.question, path },
  ];

  return (
    <MarketingShell>
      <JsonLd
        data={buildArticleData({
          origin: siteConfig.url,
          name: siteConfig.name,
          logoPath: "/logo.png",
          path,
          headline: doubt.question,
          description: doubt.description,
          date: DOUBTS_UPDATED_AT,
          breadcrumb,
        })}
      />

      <article>
        <header className="site-section !pb-10">
          <div className="container max-w-4xl">
            <nav aria-label="Trilha" className="text-sm text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-2">
                {breadcrumb.slice(0, -1).map((item) => (
                  <li key={item.path} className="flex items-center gap-2">
                    <Link href={item.path} className="site-link hover:text-foreground">
                      {item.name}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </li>
                ))}
                <li aria-current="page">{doubt.category}</li>
              </ol>
            </nav>
            <h1 className="site-h1 mt-6">
              <span className="site-mask">
                <span>{doubt.question}</span>
              </span>
            </h1>
            <p className="site-answer prime-enter mt-8">{doubt.answer}</p>
          </div>
        </header>

        <div className="container flex max-w-4xl flex-col gap-12 pb-20">
          {doubt.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-lg leading-8 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="mt-4 list-disc space-y-2 pl-6 text-lg leading-8 text-muted-foreground marker:text-[hsl(var(--site-accent))]">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <section className="site-section site-band" aria-labelledby="prime-titulo">
          <div className="container grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <h2 id="prime-titulo" className="site-h2">
                Como o Prime Ges resolve isso
              </h2>
              <p className="site-lead mt-4">{doubt.prime.intro}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {doubt.prime.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-base leading-7 text-foreground">
                    <Check className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
              {doubt.limit && (
                <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
                  <strong className="text-foreground">Para decidir com clareza: </strong>
                  {doubt.limit}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <PrimaryCta />
                <Link href="/recursos" className="site-link text-sm font-medium text-foreground">
                  Ver todos os recursos
                </Link>
              </div>
            </div>
            {doubt.screen && (
              <div className="site-grow">
                <ProductScreen id={doubt.screen} />
              </div>
            )}
          </div>
          {views && (
            <div className="container mt-4">
              <PricingGrid views={views} />
            </div>
          )}
        </section>
      </article>

      <section className="site-section" aria-labelledby="relacionadas-titulo">
        <div className="container max-w-4xl">
          <h2 id="relacionadas-titulo" className="text-2xl font-semibold tracking-tight text-foreground">
            Outras dúvidas
          </h2>
          <ul className="mt-6 border-t border-border">
            {doubt.related.flatMap((slug) => {
              const item = getDoubt(slug);
              if (!item) return [];
              return (
                <li key={slug}>
                  <Link href={doubtPath(slug)} className="site-row site-row--doubt">
                    <span className="text-lg font-semibold text-foreground">{item.question}</span>
                    <ArrowRight className="site-row__arrow h-5 w-5 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <FinalCta trialLabel={null} />
    </MarketingShell>
  );
}
