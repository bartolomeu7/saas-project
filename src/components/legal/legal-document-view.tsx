import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { LegalDocument } from "@/content/legal/types";
import { LEGAL_ROUTES, findLegalMarkers } from "@/lib/legal/documents";
import { Badge } from "@/components/ui/badge";

const MARKER_SPLIT = /(\[(?:BLOCKED|VALIDAÇÃO)[^\]]*\])/g;

/** Destaca os marcadores pendentes ([BLOCKED...] e [VALIDAÇÃO...]) para a revisão não perdê-los. */
function withMarkers(text: string): ReactNode[] {
  return text.split(MARKER_SPLIT).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded bg-warning/25 px-1 py-0.5 text-sm font-medium text-foreground ring-1 ring-warning/50"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });

/**
 * Página de documento legal (Termos / Política): versão, vigência, índice navegável e seções
 * numeradas automaticamente. O texto vem de src/content/legal (versionado no Git); o hash exibido
 * é o SHA-256 desse texto (o mesmo registrado em legal_document_versions).
 */
export function LegalDocumentView({ doc, hash }: { doc: LegalDocument; hash: string }) {
  const pending = findLegalMarkers(doc).length;
  const other = doc.type === "TERMS_OF_USE" ? "PRIVACY_POLICY" : "TERMS_OF_USE";
  const otherLabel = doc.type === "TERMS_OF_USE" ? "Política de Privacidade" : "Termos de Uso";

  return (
    <div className="container py-10 sm:py-14">
      <header className="mx-auto max-w-3xl">
        <Badge variant="muted">Documento legal</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{doc.title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{doc.summary}</p>
        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <dt className="text-xs text-muted-foreground">Versão</dt>
            <dd className="mt-0.5 font-medium text-foreground">{doc.version}</dd>
          </div>
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <dt className="text-xs text-muted-foreground">Em vigor desde</dt>
            <dd className="mt-0.5 font-medium text-foreground">{DATE_FORMAT.format(new Date(doc.effectiveAt))}</dd>
          </div>
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <dt className="text-xs text-muted-foreground">Impressão digital (SHA-256)</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-foreground" title={hash}>
              {hash.slice(0, 16)}…
            </dd>
          </div>
        </dl>

        {pending > 0 && (
          <div
            role="note"
            className="mt-6 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              <strong>Versão de desenvolvimento.</strong> Este texto ainda tem {pending} ponto(s) pendente(s) de
              dado da empresa ou de revisão jurídica, destacados abaixo. Ele não deve ser publicado em
              Production antes de resolvê-los.
            </p>
          </div>
        )}
      </header>

      <div className="mx-auto mt-10 grid max-w-5xl gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Neste documento" className="lg:sticky lg:top-24 lg:self-start">
          <details className="rounded-lg border border-border bg-card/50 p-3 lg:border-0 lg:bg-transparent lg:p-0" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground lg:cursor-default lg:list-none">
              Neste documento
            </summary>
            <ol className="mt-3 flex flex-col gap-1.5 text-sm">
              {doc.sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={"#" + section.id}
                    className="block rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>

        <article className="min-w-0">
          {doc.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 border-b border-border py-7 first:pt-0 last:border-0">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {index + 1}. {section.title}
              </h2>
              {section.paragraphs.map((paragraph, i) => (
                <p key={i} className="mt-3 text-[15px] leading-7 text-muted-foreground">
                  {withMarkers(paragraph)}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground marker:text-primary">
                  {section.items.map((item, i) => (
                    <li key={i}>{withMarkers(item)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <p className="mt-8 text-sm text-muted-foreground">
            Leia também:{" "}
            <Link href={LEGAL_ROUTES[other]} className="font-medium text-primary underline-offset-4 hover:underline">
              {otherLabel}
            </Link>
            . Este documento é um texto operacional e não substitui aconselhamento jurídico.
          </p>
        </article>
      </div>
    </div>
  );
}
